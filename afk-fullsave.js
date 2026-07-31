/* ============================================================================
 * afk-fullsave.js — 整包備份 / 還原(本機檔案·零後端)
 *
 * 解決什麼:核心 exportSave/importSave 一次只搬「一格角色」,而倉庫/寵物/收集冊/血盟
 *   是附在該格匯出檔裡的快照,匯入還要逐項 confirm。16 格角色要來回 16 次
 *   (afk-reissueid 的警語就是叫玩家每隻各匯一次)。這裡一次搬完整台的遊戲資料。
 *   方案與取捨見 docs/save-transfer.md「方案①」。
 *
 * 🚨 整包搬,不挑 key——連白名單都不要:
 *   一度寫成「只搬 lineage_idle_/fb5_/afk_/dograce_ 前綴」,已否決。任何形式的清單都要跟著
 *   上游走,作者哪天新增一個 key 我們不會知道,漏搬是**安靜失效**(玩家搬完、玩一陣子才發現
 *   東西不見,而且查不出來)。正確性論證很硬:B 變成 A 的完整複本,A 跑得動 B 就跑得動。
 *   → 匯出 localStorage 全部 key,還原時把現有的全部清掉再原樣寫回。新增功能自動涵蓋,零維護。
 *
 * 還原的安全設計(每一條都是「弄壞玩家存檔」的防線):
 *   ① 備份只用**文字建議**(確認框裡提醒「先按上面的匯出」),刻意不做「強制自動下載一份」——
 *      瀏覽器擋下載、玩家按取消、手機存到哪都偵測不到,download() 回 true 只代表「觸發了動作」,
 *      拿它當前置條件是假保證,只換來多兩個對話框。
 *      也刻意不做記憶體快照回滾:整包 localStorage 讀進 JS 是 UTF-16、體積 ×2,加上新包本身,
 *      在 iOS 上等於自找記憶體壓力。
 *   ② 寫入前**完整驗證**整份檔案(格式/schema/每個值都是字串/至少一格角色存檔),
 *      驗不過一個字都不寫。
 *   ③ clear() 全清再原樣寫回(配額峰值最低);中途寫失敗立刻停手並明講要用備份檔救回來。
 *      在途的背景壓縮不會來搗亂:worker 回來時會比對 _lsGet(key) 是不是它記得的原值
 *      (js/00-data.js:136),clear 過或已被新值覆蓋都對不上 → 自己 return 不寫。
 *   ④ 寫入一律走 _lzSetStoredRaw(原值原樣直寫+bump rev 讓在途壓縮失效)。
 *      不可用 _lzSet:它先寫明文再背景壓縮,明文可能當場撐爆 5MB 配額。
 *   ⑥ 入口在首頁設定選單(afk-storage,掛在 #main-menu)→ 天然只有主選單開得到,
 *      不會發生「遊戲中還原完,記憶體裡的舊 player 又被 saveGame 寫回去」。
 *
 * 優雅降級:缺 _lzSetStoredRaw / AFK_SETTINGS 就 console.warn 後安靜停用。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) AFK_TOGGLES.register({
    id: 'fullsave', parent: 'storage', name: '整包備份／還原', group: '系統與其他', def: true,
    desc: '把整台裝置的遊戲資料（全部角色＋倉庫＋寵物＋收集冊＋血盟＋外掛設定）存成一個檔案，換手機時一次搬完；也可以把檔案傳給作者查問題。'
  });
  function on() { try { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('fullsave'); } catch (e) { return true; } }

  if (typeof window._lzSetStoredRaw !== 'function') {
    try { console.warn('[AFK-fullsave] 缺核心 _lzSetStoredRaw,整包備份/還原停用。'); } catch (e) {}
    return;
  }

  var FORMAT = 'idle-lineage-full';
  var SCHEMA = 1;

  function lsKeys() {
    var out = [];
    for (var k in localStorage) { if (Object.prototype.hasOwnProperty.call(localStorage, k)) out.push(k); }
    return out;
  }
  function fmtKB(chars) { return (chars / 1024).toFixed(chars < 102.4 ? 1 : 0) + ' KB'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function scan() {
    var all = [], chars = 0;
    lsKeys().forEach(function (k) {
      var v; try { v = localStorage.getItem(k); } catch (e) { return; }
      if (v == null) return;
      all.push(k); chars += k.length + v.length;
    });
    return { all: all, chars: chars };
  }

  function buildPack() {
    var s = scan(), keys = {};
    s.all.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) keys[k] = v; });
    var app = '';
    try { app = (document.getElementById('afk-ver-text') || {}).textContent || ''; } catch (e) {}
    return {
      format: FORMAT, schema: SCHEMA, exportedAt: new Date().toISOString(), app: app,
      keyCount: s.all.length, totalChars: s.chars, keys: keys
    };
  }

  function download(text, fname) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) { return false; }
  }

  function doExport() {
    var fname = 'idle-lineage-full-' + stamp() + '.json';
    var text;
    try { text = JSON.stringify(buildPack()); }
    catch (e) { note('❌ 打包失敗：' + (e && e.message || e), true); return null; }
    if (!download(text, fname)) { note('❌ 檔案下載失敗（瀏覽器可能擋住了下載）。', true); return null; }
    return { fname: fname, bytes: text.length };
  }

  // ── 還原 ───────────────────────────────────────────────────
  // 驗證整份檔案;回傳 { ok, err, pack, saves }。驗不過一個字都不寫。
  function validate(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return { ok: false, err: '這不是有效的 JSON 檔（解析失敗）。' }; }
    if (!d || typeof d !== 'object') return { ok: false, err: '檔案內容不是物件。' };
    if (d.format !== FORMAT) {
      return { ok: false, err: (d.format === 'idle-lineage-desktop-save' || d.p || d.save)
        ? '這是「單一角色」的存檔檔，請用載入畫面的「匯入進度」；這裡只收整包備份檔。'
        : '這不是整包備份檔（format 不符）。' };
    }
    if (!(d.schema <= SCHEMA)) return { ok: false, err: '這個備份檔來自更新版本的遊戲（schema ' + d.schema + '），本版讀不了。' };
    if (!d.keys || typeof d.keys !== 'object' || Array.isArray(d.keys)) return { ok: false, err: '備份檔缺少 keys 內容。' };
    var names = Object.keys(d.keys);
    if (!names.length) return { ok: false, err: '備份檔是空的（沒有任何項目）。' };
    for (var i = 0; i < names.length; i++) {
      if (typeof d.keys[names[i]] !== 'string') return { ok: false, err: '備份檔內容毀損（「' + names[i] + '」不是文字）。' };
    }
    var saves = names.filter(function (k) { return /^lineage_idle_save_\d+$/.test(k) && d.keys[k].length > 32; });
    if (!saves.length) return { ok: false, err: '備份檔裡沒有任何角色存檔，為了安全不進行還原。' };
    if (d.keyCount != null && d.keyCount !== names.length) return { ok: false, err: '備份檔項目數對不上（檔案可能不完整）。' };
    return { ok: true, pack: d, saves: saves };
  }

  // 實際寫入:整個清空再原樣寫回。中途失敗立刻停手,回報寫到第幾個。
  function applyPack(pack) {
    var names = Object.keys(pack.keys);
    try { localStorage.clear(); }
    catch (e) { return { ok: false, done: 0, err: '清除舊資料時失敗：' + (e && e.message || e) }; }
    for (var i = 0; i < names.length; i++) {
      var k = names[i], okw = false;
      try { okw = _lzSetStoredRaw(k, pack.keys[k]) !== false; } catch (e) { okw = false; }
      if (!okw) return { ok: false, done: i, total: names.length, failKey: k, err: '寫入「' + k + '」失敗（多半是這台裝置的儲存空間不足）。' };
    }
    return { ok: true, done: names.length };
  }

  function startRestore() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onerror = function () { note('❌ 讀取檔案失敗。', true); };
      reader.onload = function () {
        var v = validate(String(reader.result || ''));
        if (!v.ok) { note('❌ ' + v.err, true); return; }
        confirmAndApply(v);
      };
      reader.readAsText(f);
    };
    input.click();
  }

  function confirmAndApply(v) {
    var pack = v.pack;
    var when = '';
    try { when = new Date(pack.exportedAt).toLocaleString('zh-TW'); } catch (e) { when = pack.exportedAt || '?'; }
    var body = '這個備份檔：\n'
      + '· 建立於 ' + when + (pack.app ? '（' + pack.app + '）' : '') + '\n'
      + '· 含 ' + v.saves.length + ' 個角色、共 ' + Object.keys(pack.keys).length + ' 個項目（' + fmtKB(pack.totalChars || 0) + '）\n\n'
      + '還原會把「這台裝置上現有的全部遊戲資料」整個換掉，包含所有角色、倉庫、寵物、收集冊與外掛設定，而且沒有辦法復原。\n\n'
      + '如果這台裝置上的進度還要留，請先取消，按上面的「📤 匯出整包備份」存一份再回來還原。';
    ask(body, function () { runApply(pack); });
  }

  function runApply(pack) {
    note('還原中…請不要關掉頁面。');
    var r = applyPack(pack);
    if (!r.ok) {
      note('❌ ' + r.err
        + (r.total ? '（已寫入 ' + r.done + '/' + r.total + ' 項）' : '')
        + '\n這台裝置的資料現在是不完整的，請'
        + (backupName ? '重新匯入剛才下載的「' + backupName + '」把它救回來' : '重新匯入一次備份檔')
        + '，或改用空間比較夠的裝置。', true);
      return;
    }
    note('✅ 已還原 ' + r.done + ' 個項目，即將重新載入…');
    setTimeout(function () { try { location.reload(); } catch (e) {} }, 900);
  }

  function ask(message, onOk) {
    if (window.AFK_UI && AFK_UI.confirm) {
      AFK_UI.confirm({ title: '⚠️ 整包還原', message: message, okText: '我了解，繼續', cancelText: '取消', danger: true, onOk: onOk });
    } else if (window.confirm(message)) { onOk(); }
  }

  // ── 面板 ───────────────────────────────────────────────────
  var _layer = null;
  function note(html, bad) {
    var el = document.getElementById('m-fsv-note');
    if (!el) return;
    el.className = bad ? 'fsv-note fsv-bad' : 'fsv-note';
    el.innerHTML = esc(html).replace(/\n/g, '<br>');
  }
  function renderBody() {
    var s = scan();
    var h = '<div class="fsv-sum">這台裝置目前有 <b>' + s.all.length + '</b> 個儲存項目，共 <b>' + fmtKB(s.chars) + '</b>。</div>'
      + '<div class="fsv-desc">整包備份包含：全部存檔格、共用倉庫、寵物、收集冊、血盟世界、離線紀錄與外掛設定。'
      + '換手機時在新裝置還原一次就好，不必每個角色各匯一次。</div>'
      + '<div class="fsv-btns">'
      + '<button id="m-fsv-exp" class="fsv-b fsv-go">📤 匯出整包備份</button>'
      + '<button id="m-fsv-imp" class="fsv-b fsv-danger">📥 從檔案還原（會整台覆蓋）</button>'
      + '</div>'
      + '<div id="m-fsv-note" class="fsv-note"></div>'
      + '<div class="fsv-warn">備份會把這個網站上<b>全部</b>的儲存內容原樣複製一份（刻意不挑，'
      + '免得遊戲更新後多出來的東西被漏掉）；還原會把這台現有的整個換掉。</div>';
    return h;
  }
  function openModal() {
    if (!on()) return;
    buildModal();
    if (_layer) return;
    var m = document.getElementById('m-fsv-modal'); if (!m) return;
    document.getElementById('m-fsv-body').innerHTML = renderBody();
    var e1 = document.getElementById('m-fsv-exp');
    if (e1) e1.addEventListener('click', function () {
      var b = doExport(null);
      if (b) note('✅ 已匯出：' + b.fname + '（' + fmtKB(b.bytes) + '）\n檔案在你的「下載」資料夾，可以用 LINE / AirDrop 傳到新裝置。');
    });
    var e2 = document.getElementById('m-fsv-imp');
    if (e2) e2.addEventListener('click', startRestore);
    m.classList.add('open');
    _layer = window.AFK_UI ? AFK_UI.openLayer(hideModal) : null;
  }
  function hideModal() { var m = document.getElementById('m-fsv-modal'); if (m) m.classList.remove('open'); _layer = null; }
  function closeModal() { if (_layer && window.AFK_UI) AFK_UI.closeLayer(_layer); else hideModal(); }

  function buildModal() {
    injectCSS();
    if (document.getElementById('m-fsv-modal')) return;
    var modal = document.createElement('div');
    modal.id = 'm-fsv-modal';
    modal.innerHTML = '<div id="m-fsv-card">'
      + '<div id="m-fsv-head"><span id="m-fsv-title">💾 整包備份／還原</span><button id="m-fsv-close" title="關閉">✕</button></div>'
      + '<div id="m-fsv-body"></div></div>';
    document.body.appendChild(modal);
    document.getElementById('m-fsv-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  }

  // Tailwind 是預建置的(動態拼沒出現過的 class 會安靜失效)→ 一律用自己的具名 class
  function injectCSS() {
    if (document.getElementById('m-fsv-style')) return;
    var s = document.createElement('style'); s.id = 'm-fsv-style';
    s.textContent = [
      '#m-fsv-modal{display:none;position:fixed;inset:0;top:var(--orig-bar-h,0px);z-index:1000;background:rgba(2,6,23,.82);align-items:flex-start;justify-content:center;padding:24px 12px;font-family:system-ui,"Segoe UI",sans-serif;}',
      '#m-fsv-modal.open{display:flex;}',
      '#m-fsv-card{background:#0f172a;border:1px solid #334155;border-radius:12px;max-width:520px;width:100%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.6);}',
      '#m-fsv-head{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #334155;}',
      '#m-fsv-title{color:#fcd34d;font-weight:700;}',
      '#m-fsv-close{color:#94a3b8;background:none;border:0;font-size:18px;cursor:pointer;padding:2px 6px;}',
      '#m-fsv-body{padding:14px;overflow:auto;color:#e2e8f0;font-size:13px;line-height:1.7;}',
      '.fsv-sum{margin-bottom:6px;}',
      '.fsv-desc{color:#94a3b8;font-size:12px;margin-bottom:12px;}',
      '.fsv-btns{display:flex;flex-direction:column;gap:8px;}',
      '.fsv-b{border-radius:8px;padding:10px 12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;border:1px solid transparent;}',
      '.fsv-go{background:#0e7490;border-color:#0891b2;color:#cffafe;}',
      '.fsv-go:hover{background:#0891b2;}',
      '.fsv-danger{background:#7f1d1d;border-color:#b91c1c;color:#fecaca;}',
      '.fsv-danger:hover{background:#991b1b;}',
      '.fsv-note{margin-top:10px;font-size:12.5px;color:#a7f3d0;min-height:1em;}',
      '.fsv-note.fsv-bad{color:#fca5a5;}',
      '.fsv-warn{margin-top:12px;padding:8px 10px;border:1px solid #78350f;background:rgba(120,53,15,.28);border-radius:8px;color:#fcd34d;font-size:12px;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  function init() {
    window.AFK_SETTINGS = window.AFK_SETTINGS || { _items: [], add: function (it) { this._items.push(it); } };
    AFK_SETTINGS.add({ label: '💾 整包備份／還原', onClick: openModal });
    try { console.log('[AFK-fullsave] hooks OK'); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
