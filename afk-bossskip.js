/**
 * afk-bossskip.js — 跳過指定頭目：勾起來的王不會再出現在野外
 *
 * 為什麼是「抽怪之前把牠從池子濾掉」而不是「生出來再拿掉」：
 *   spawnMob 生完怪已經做了一整串副作用（uid、_born 出生序、席琳強化、硬皮、BOSS 出場特效與螢幕震動），
 *   事後移除要逐一還原，漏一個就是安靜的髒狀態；在抽選之前換掉 DB.maps[地圖] 則是零副作用 ——
 *   核心本來就有「這張圖沒有王」的分支（wantBoss 條件含 bossPool.length > 0），濾完自然走那條。
 *
 * 線上與離線自動一致：afk-offline 的快速段與全模擬段出怪都經過核心 spawnMob（maybeSpawnMobs → spawnMob），
 *   掛在這裡兩邊都吃得到，不必在 afk-offline 另做一份，也不吃「快速段不跑 autoActions」那個坑。
 *
 * 不可跳的東西一律沿用上游自己的旗子，不自己維護黑名單（作者之後再標新的，我們自動跟上）：
 *   - 地圖：軍王之室／純BOSS房／安塔瑞斯巢穴／攻城／時空裂痕／傲慢之塔攀登樓層／遺忘之島 —— 那裡的 BOSS 是內容或關卡門
 *   - 怪物：DB.mobs[id].noAutoTeleport（上游標的「這隻不該被迴避頭目甩掉」：往上層的樓梯、遺忘之島傳送門）
 *   - 保險：濾完整個池會空掉就整張圖不濾 —— 上游一路在加新副本，這是「作者加了新圖、我們還沒跟上」時的防線
 *
 * ⚠️ DB / mapState / player / currentSlot / KING_ROOMS 等都是核心的 const/let，不掛 window：一律裸名存取，
 *    寫 window.DB 會拿到 undefined 而整段安靜不生效。
 */
(function () {
  'use strict';
  if (window.AFK_TOGGLES && !AFK_TOGGLES.enabled('bossskip')) return;   // 🎚️ 外掛開關（id 已列在 afk-toggles 內建目錄，關掉不會變死結）

  if (typeof window.spawnMob !== 'function' || typeof DB === 'undefined' || !DB.maps || !DB.mobs) {
    try { console.warn('[AFK-bossskip] 缺核心 spawnMob / DB，跳過頭目停用。'); } catch (e) {}
    return;
  }

  var LS_PREFIX = 'afk_bossskip_';

  // ── 清單（依存檔位分開：主力打得贏的王、練功號打不贏，兩隻角色想跳的不一樣）────────────
  var _slot = -1;                      // 已載入清單的存檔位（-1＝還沒載過）
  var _skip = null;                    // { 怪id: 1 }；null＝沒有任何要跳的（熱路徑最快早退）
  var _skipNames = null;               // { 怪名: 1 }；場上的怪實例只有名字沒有 id（js/03 是 {...DB.mobs[id]} 展開的）
  var _pool = Object.create(null);     // 地圖 → 濾過的池／null（不濾）；清單或存檔位一變就整個清掉

  function slotOf() { var n = +currentSlot; return (Number.isInteger(n) && n >= 1) ? n : 0; }

  function loadList() {
    var s = slotOf();
    if (_slot === s) return _skip;
    _slot = s; _skip = null; _skipNames = null; _pool = Object.create(null);
    if (!s) return null;
    try {
      var arr = JSON.parse(localStorage.getItem(LS_PREFIX + s) || 'null');
      if (arr && arr.length) {
        var ids = Object.create(null), names = Object.create(null), n = 0;
        for (var i = 0; i < arr.length; i++) {
          var id = arr[i];
          if (typeof id !== 'string' || !DB.mobs[id]) continue;   // 認不得的 id 直接忽略：上游改 id 時只有那一條失效，不會壞掉整份清單
          ids[id] = 1; names[DB.mobs[id].n] = 1; n++;
        }
        if (n) { _skip = ids; _skipNames = names; }
      }
    } catch (e) {}
    return _skip;
  }

  function saveList(ids) {
    var s = slotOf();
    if (!s) return;
    try { localStorage.setItem(LS_PREFIX + s, JSON.stringify(ids)); } catch (e) {}
    _slot = -1; loadList();
    clearSkippedOnField();
  }

  function currentIds() { var out = []; var m = loadList(); if (m) for (var k in m) out.push(k); return out; }

  // ── 哪些不可以跳 ───────────────────────────────────────────────────
  function skippable(id) {
    var m = DB.mobs[id];
    return !!(m && m.boss && !m.noAutoTeleport);
  }

  // 純函式（只看地圖 key 與核心常數）→ 濾好的池可以安心用 map key 當快取鍵
  function excludedMap(c) {
    try {
      if (!c) return true;
      if (c.indexOf('town_') === 0) return true;
      if (c === 'rift_battle') return true;                                   // 時空裂痕：自訂出怪，不讀 DB.maps
      if (c === 'oblivion_travel' || c === 'oblivion_island') return true;    // 遺忘之島：擊敗傳送門＝上島
      if (c.indexOf('pride_f') === 0) return true;                            // 傲慢之塔攀登樓層：擊敗樓層頭目＝前進，跳掉會卡在原樓
      if (typeof KING_ROOMS !== 'undefined' && KING_ROOMS[c]) return true;
      if (typeof PURE_BOSS_MAPS !== 'undefined' && PURE_BOSS_MAPS.indexOf(c) >= 0) return true;
      if (typeof ANTHARAS_AREA_BOSS !== 'undefined' && ANTHARAS_AREA_BOSS[c]) return true;
      if (typeof isSiegeArea === 'function' && isSiegeArea(c)) return true;
      return false;
    } catch (e) { return true; }   // 判斷不出來就不濾（寧可功能沒生效，也不要把地圖弄到出不了怪）
  }

  function computePool(c) {
    var pool = DB.maps[c];
    if (!Array.isArray(pool) || !pool.length) return null;
    if (excludedMap(c)) return null;
    var out = [], removed = 0;
    for (var i = 0; i < pool.length; i++) {
      var id = pool[i];
      if (_skip[id] && skippable(id)) { removed++; continue; }
      out.push(id);
    }
    if (!removed) return null;      // 這張圖沒有要跳的 → 不換池，熱路徑零成本
    if (!out.length) return null;   // 濾完整個池空了 → 換上去會抽不到怪（mobId undefined）而空轉，寧可不濾
    return out;
  }

  function filteredPool(c) {
    if (!loadList() || !c) return null;
    if (c in _pool) return _pool[c];
    var r;
    try { r = computePool(c); } catch (e) { r = null; }
    _pool[c] = r;
    return r;
  }

  // ── 核心掛點 ──────────────────────────────────────────────────────
  // 換池 → 跑原函式 → finally 換回來。DB.maps 是共用資料，任何路徑都不可以把濾過的池留在上面。
  var _origSpawnMob = window.spawnMob;
  window.spawnMob = function () {
    if (!loadList()) return _origSpawnMob.apply(this, arguments);
    var c = null;
    try { c = mapState && mapState.current; } catch (e) {}
    var pool = filteredPool(c);
    if (!pool) return _origSpawnMob.apply(this, arguments);
    var orig = DB.maps[c];
    DB.maps[c] = pool;
    try { return _origSpawnMob.apply(this, arguments); }
    finally { DB.maps[c] = orig; }
  };

  // 剛勾起來、而牠正站在畫面上 → 清掉那一格。只在清單變更時掃一次：
  //   每 tick 掃場是每秒 10 次的熱路徑，而它能多解決的只有「上游又生出一條不經池子的路」——
  //   那種情況本來就該讓牠出現（作者有自己的理由，見上面 noAutoTeleport 那條的精神）。
  function clearSkippedOnField() {
    try {
      if (!_skipNames) return;
      if (typeof mapState === 'undefined' || !mapState || !mapState.mobs) return;
      if (!filteredPool(mapState.current)) return;   // 這張圖本來就不濾 → 場上的也不動
      var hit = false;
      for (var i = 0; i < mapState.mobs.length; i++) {
        var m = mapState.mobs[i];
        if (!m || !m.boss || m._dead) continue;      // 已死待清算的不能動，會連掉落一起吞掉
        if (!_skipNames[m.n]) continue;
        mapState.mobs[i] = null;
        if (mapState.spawnAt) mapState.spawnAt[i] = null;
        hit = true;
      }
      if (hit && typeof renderMobs === 'function') renderMobs();
    } catch (e) {}
  }

  // 給 afk-bossring 問「這張圖還有沒有王可召」：全跳掉又開著自動找 BOSS 會無限燒瞬移卷軸。
  // 回 null＝這裡答不出來，呼叫端退回它自己原本的判斷。
  function spawnableBossIds(c) {
    try {
      var pool = filteredPool(c) || DB.maps[c];
      if (!Array.isArray(pool)) return null;
      var out = [];
      for (var i = 0; i < pool.length; i++) if (DB.mobs[pool[i]] && DB.mobs[pool[i]].boss) out.push(pool[i]);
      return out;
    } catch (e) { return null; }
  }

  window.AFK_BOSSSKIP = {
    spawnableBossIds: spawnableBossIds,
    list: currentIds,
    isSkipped: function (id) { var m = loadList(); return !!(m && m[id]); },
    set: function (ids) { saveList(Array.isArray(ids) ? ids.filter(function (x) { return typeof x === 'string'; }) : []); },
    open: function () { openPanel(); }
  };

  // ── 目錄：全遊戲「跳得掉」的頭目（DB 是靜態資料，算一次就好）──────────────────
  var _catalog = null;
  // 先問金卡那張表：它已經把 MAP_CATEGORIES 沒收的圖（隱藏區域、風木地監…）補齊了，
  // 只靠 mapDisplayName 會讓那幾隻頭目的「出沒地」整欄空白。
  function mapLabel(k) {
    try {
      if (typeof _CARD_MAP_NAMES !== 'undefined' && _CARD_MAP_NAMES[k]) return _CARD_MAP_NAMES[k];
      return (typeof mapDisplayName === 'function' ? mapDisplayName(k) : null) || '';
    } catch (e) { return ''; }
  }
  function catalog() {
    if (_catalog) return _catalog;
    var byId = Object.create(null);
    for (var mk in DB.maps) {
      if (excludedMap(mk)) continue;
      var pool = DB.maps[mk];
      if (!Array.isArray(pool)) continue;
      for (var i = 0; i < pool.length; i++) {
        var id = pool[i];
        if (!skippable(id)) continue;
        var e = byId[id];
        if (!e) e = byId[id] = { id: id, n: DB.mobs[id].n, lv: DB.mobs[id].lv || 0, maps: [], mapKeys: [] };
        e.mapKeys.push(mk);
        var lab = mapLabel(mk);
        if (lab && e.maps.indexOf(lab) < 0) e.maps.push(lab);
      }
    }
    _catalog = [];
    for (var k in byId) _catalog.push(byId[k]);
    _catalog.sort(function (a, b) { return (a.lv - b.lv) || (a.n < b.n ? -1 : 1); });
    return _catalog;
  }

  function masteryBossName() {
    try {
      if (typeof MASTERY_DATA === 'undefined' || typeof player === 'undefined' || !player) return '';
      if (player.masteryQuest !== 'active') return '';
      var d = MASTERY_DATA[player.cls];
      return (d && d.boss) || '';
    } catch (e) { return ''; }
  }

  // ── 面板 ──────────────────────────────────────────────────────────
  var layer = null, _q = '';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function rowsHtml() {
    var here = '';
    try { here = (mapState && mapState.current) || ''; } catch (e) {}
    var q = _q.trim();
    var items = catalog().filter(function (e) {
      if (!q) return true;
      if (e.n.indexOf(q) >= 0) return true;
      for (var i = 0; i < e.maps.length; i++) if (e.maps[i].indexOf(q) >= 0) return true;
      return false;
    });
    // 目前所在地圖的頭目置頂：玩家開這個面板，十之八九就是為了眼前這隻
    items = items.slice().sort(function (a, b) {
      var ah = here && a.mapKeys.indexOf(here) >= 0 ? 0 : 1;
      var bh = here && b.mapKeys.indexOf(here) >= 0 ? 0 : 1;
      return (ah - bh) || (a.lv - b.lv) || (a.n < b.n ? -1 : 1);
    });
    if (!items.length) return '<div class="m-bskip-empty">找不到符合的頭目。</div>';
    var sk = loadList() || {};
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var e = items[i];
      var on = !!sk[e.id];
      var atHere = here && e.mapKeys.indexOf(here) >= 0;
      html += '<div class="m-bskip-row' + (on ? ' on' : '') + '" data-id="' + esc(e.id) + '">'
        + '<div class="m-bskip-cb"></div>'
        + '<div class="m-bskip-txt"><div class="m-bskip-nm">' + esc(e.n)
        + '<span class="m-bskip-lv">Lv.' + e.lv + '</span>'
        + (atHere ? '<span class="m-bskip-here">所在地</span>' : '')
        + '</div>'
        + (e.maps.length ? '<div class="m-bskip-mp">' + esc(e.maps.join('、')) + '</div>' : '')
        + '</div></div>';
    }
    return html;
  }

  function renderRows() {
    var box = document.getElementById('m-bskip-list');
    if (!box) return;
    box.innerHTML = rowsHtml();
    var foot = document.getElementById('m-bskip-clear');
    if (foot) foot.disabled = currentIds().length === 0;
  }

  function setSkipped(id, on) {
    var ids = currentIds();
    var at = ids.indexOf(id);
    if (on && at < 0) ids.push(id);
    else if (!on && at >= 0) ids.splice(at, 1);
    else return;
    saveList(ids);
    renderRows();
  }

  function onRowClick(id) {
    var on = !AFK_BOSSSKIP.isSkipped(id);
    var mb = on ? masteryBossName() : '';
    if (mb && DB.mobs[id] && DB.mobs[id].n === mb && window.AFK_UI && AFK_UI.confirm) {
      AFK_UI.confirm({
        title: '跳過指定頭目',
        message: '精通任務要打倒' + mb + '，跳過就拿不到精通之證。',
        okText: '仍要跳過', danger: true,
        onOk: function () { setSkipped(id, true); }
      });
      return;
    }
    setSkipped(id, on);
  }

  function buildModal() {
    if (document.getElementById('m-bskip-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'm-bskip-modal';
    wrap.innerHTML =
      '<div class="m-bskip-box">'
      + '<div class="m-bskip-head"><span>🚫 跳過的頭目</span><button type="button" id="m-bskip-x">✕</button></div>'
      + '<div class="m-bskip-sub">勾選的頭目不會再出現。</div>'
      + '<div class="m-bskip-tools"><input id="m-bskip-search" type="search" placeholder="搜尋頭目或地圖" autocomplete="off"></div>'
      + '<div id="m-bskip-list"></div>'
      + '<div class="m-bskip-foot"><button type="button" class="m-bskip-btn" id="m-bskip-clear">全部不跳過</button></div>'
      + '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.getElementById('m-bskip-x').addEventListener('click', close);
    document.getElementById('m-bskip-search').addEventListener('input', function () { _q = this.value || ''; renderRows(); });
    document.getElementById('m-bskip-clear').addEventListener('click', function () {
      if (!currentIds().length) return;
      saveList([]); renderRows();
    });
    document.getElementById('m-bskip-list').addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.m-bskip-row') : null;
      if (row) onRowClick(row.getAttribute('data-id'));
    });
  }

  function openPanel() {
    buildModal();
    _q = '';
    var s = document.getElementById('m-bskip-search'); if (s) s.value = '';
    renderRows();
    document.getElementById('m-bskip-modal').style.display = 'flex';
    layer = (window.AFK_UI && AFK_UI.openLayer) ? AFK_UI.openLayer(doClose) : null;   // 手機返回鍵 / ESC 可關
  }
  function close() { if (layer && window.AFK_UI) AFK_UI.closeLayer(layer); else doClose(); }
  function doClose() {
    layer = null;
    var m = document.getElementById('m-bskip-modal');
    if (m) m.style.display = 'none';
  }

  // ── 入口：自動化分頁「🔌 外掛」列 ─────────────────────────────────
  function injectAutoNav() {
    var panel = document.getElementById('tab-automation');
    if (!panel) return false;
    if (document.getElementById('m-afk-nav-bossskip')) return true;
    var row = document.getElementById('m-afk-navrow');
    if (!row) {   // 木人場/廢品管理都被關掉時這列還不存在 → 自己建（欄位與 afk-training 一致）
      row = document.createElement('div');
      row.id = 'm-afk-navrow';
      row.className = 'bg-slate-800 p-3 rounded-lg border border-slate-700';
      row.innerHTML = '<div class="text-sm text-amber-400 mb-2 border-b border-slate-700 pb-1 font-bold">🔌 外掛</div>' +
        '<div id="m-afk-navrow-btns" style="display:flex;gap:8px;flex-wrap:wrap;"></div>';
      panel.appendChild(row);
    }
    var b = document.createElement('button');
    b.id = 'm-afk-nav-bossskip'; b.type = 'button';
    b.className = 'btn py-2 text-sm bg-slate-700 hover:bg-slate-600 border-slate-500';
    b.style.width = '100%';
    b.style.marginTop = '8px';
    b.textContent = '🚫 跳過的頭目';
    b.addEventListener('click', openPanel);
    row.appendChild(b);
    return true;
  }

  function injectCss() {
    if (document.getElementById('m-bskip-css')) return;
    var st = document.createElement('style');
    st.id = 'm-bskip-css';
    // z-index 9800：比照 afk-junkmgr——要壓過手機底部導覽列(9600)與浮動日誌(9500)，
    // 仍低於 AFK_UI 的 confirm(10001)，精通任務那句確認才會疊在本視窗之上。
    st.textContent = [
      '#m-bskip-modal{position:fixed;inset:0;top:var(--orig-bar-h,0px);z-index:9800;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;padding:14px;}',
      '.m-bskip-box{width:100%;max-width:560px;max-height:calc((100dvh - var(--orig-bar-h,0px)) * .9);display:flex;flex-direction:column;overflow:hidden;background:#0f172a;border:1px solid #475569;border-radius:12px;color:#e2e8f0;box-shadow:0 20px 60px rgba(0,0,0,.6);}',
      '.m-bskip-head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;font-size:16px;font-weight:bold;color:#fbbf24;border-bottom:1px solid #334155;}',
      '.m-bskip-head button{background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:0 4px;}',
      '.m-bskip-sub{flex:none;padding:8px 14px 0;font-size:12px;color:#94a3b8;}',
      '.m-bskip-tools{flex:none;display:flex;gap:6px;padding:8px 14px 8px;}',
      '#m-bskip-search{flex:1;min-width:0;background:#1e293b;border:1px solid #475569;border-radius:6px;color:#e2e8f0;padding:7px 9px;font-size:13px;outline:none;font-family:inherit;}',
      '#m-bskip-search:focus{border-color:#d97706;}',
      '#m-bskip-list{flex:1;min-height:120px;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;border-top:1px solid #1e293b;border-bottom:1px solid #1e293b;background:#0b1220;}',
      '.m-bskip-row{display:flex;align-items:center;gap:9px;padding:8px 12px;border-bottom:1px solid #1e293b;cursor:pointer;user-select:none;-webkit-user-select:none;}',
      '.m-bskip-row:hover{background:#152034;}',
      '.m-bskip-row.on{background:#3b2a08;}',
      '.m-bskip-cb{flex:none;width:17px;height:17px;border:1px solid #64748b;border-radius:4px;background:#0f172a;position:relative;}',
      '.m-bskip-row.on .m-bskip-cb{background:#b45309;border-color:#d97706;}',
      '.m-bskip-row.on .m-bskip-cb::after{content:"✓";position:absolute;left:2px;top:-2px;font-size:14px;color:#fff;font-weight:bold;}',
      '.m-bskip-txt{flex:1;min-width:0;}',
      '.m-bskip-nm{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.m-bskip-lv{color:#64748b;font-size:11px;margin-left:6px;}',
      '.m-bskip-here{color:#38bdf8;font-size:11px;margin-left:6px;border:1px solid #0e7490;border-radius:4px;padding:0 4px;}',
      '.m-bskip-mp{font-size:11px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.m-bskip-empty{padding:26px 14px;text-align:center;color:#64748b;font-size:13px;}',
      '.m-bskip-foot{flex:none;display:flex;gap:8px;padding:10px 14px;}',
      '.m-bskip-btn{flex:1;cursor:pointer;border-radius:6px;padding:8px 6px;font-size:13px;background:#334155;border:1px solid #475569;color:#e2e8f0;white-space:nowrap;font-family:inherit;}',
      '.m-bskip-btn:hover{background:#475569;}',
      '.m-bskip-btn:disabled{opacity:.45;cursor:default;background:#334155;}',
      '@media (max-width:640px){.m-bskip-box{max-width:none;max-height:calc((100dvh - var(--orig-bar-h,0px)) * .94);}.m-bskip-tools,.m-bskip-foot{padding-left:10px;padding-right:10px;}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  function init() {
    injectCss();
    var tries = 0;
    (function tryInject() {
      if (injectAutoNav()) return;
      if (++tries < 40) setTimeout(tryInject, 500);
      else try { console.warn('[AFK-bossskip] 找不到 tab-automation，入口未注入'); } catch (e) {}
    })();
    try { console.log('[AFK-bossskip] hooks OK — 跳過指定頭目已啟用。'); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
