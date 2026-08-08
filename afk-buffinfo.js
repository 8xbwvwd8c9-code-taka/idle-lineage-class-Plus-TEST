/* ============================================================================
 * afk-buffinfo.js — 「狀態」欄補上三種看不見的生效中效果
 *
 * 上游的狀態欄（#dt-buffs）只認兩種東西：查得到 DB.skills 的技能增益，以及寫死的那幾樣
 * 藥水／變身／席琳件數。於是這三種明明生效中的效果，玩家在畫面上完全看不到：
 *   ・龍裔（player.buffs.sk_set_dragonscion）——龍血套裝 3 件的 10 秒減傷，它不是技能、
 *     DB.skills 查不到，右上狀態圖示列也沒有對應的圖檔（assets/ 是上游鏡像，不能自己塞）→ 只能走文字。
 *   ・血盟 Buff——開著就一直在加數值，但畫面上只有血盟分頁看得到。
 *   ・一般裝備套裝（寒冰／真．冥皇／司祭苦行…）——裝備分頁的欄位會亮琥珀金框，但戰鬥中看不到。
 *   （席琳套裝的「組名 n/5」上游本來就有，不重複顯示。）
 *
 * 作法：包核心 renderStatusEffects()（每 tick 會重寫 #dt-buffs），原函式跑完後把這幾格補上去，
 *   比照 afk-trackinfo：沒有增益時上游印「狀態: 正常」→ 把「正常」讓出來而不是接在它後面。
 *
 * 兩個「不自己抄一份」的地方（抄了就會跟上游走鐘，而且是安靜的）：
 *   ・套裝門檻直接從核心 recomputeStats 的原始碼撈 setCheck['xxx'] >= N ——
 *     ⚠️ 認的是 js/02（數值真正生效的地方），不是 js/10 那份欄位底色判定：兩邊對抗魔套裝就不一致
 *     （js/02 要 3 件才 MR+5、js/10 亮 2 件）。撈不到任何一組就不顯示套裝那段（安靜降級）。
 *   ・血盟 Buff 不自己查狀態：getClanBuffStats() 內部會讀 localStorage ＋ 解壓 ＋ JSON.parse，
 *     每 tick 呼叫等於每秒做十次。改成「包住它、記下核心自己算出來的結果」——零額外成本，
 *     而且開關／貢獻不足自動關閉都會走 calcStats → 一定會被記到。
 *
 * 掛接：在 index.html 的 </body> 前 <script src="afk-buffinfo.js">；
 *   載入順序要排在 afk-trackinfo 之前（讓「🔍 追蹤」留在最後一格）、afk-battlebuffs 之前
 *   （手機戰鬥框下方的鏡射才會含這幾格）。
 * ========================================================================== */
(function () {
  'use strict';

  var TID = 'buffinfo';
  if (window.AFK_TOGGLES) {
    AFK_TOGGLES.register({
      id: TID, name: '狀態欄補上龍裔／血盟／套裝', group: '遊戲介面', def: true,
      desc: '龍裔、血盟 Buff、生效中的套裝也顯示在「狀態」欄'
    });
  }
  function on() { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled(TID); }

  // ⚠ player/DB/BUFF_NAMES 在核心是 let/const/function 宣告 → 直接用識別字讀,不要寫 window.player（永遠 undefined）
  function alive() { return typeof player !== 'undefined' && player && player.cls; }

  // ── 血盟 Buff:包住核心的查詢函式,只記結果 ────────────────────────────
  var _clanOn = null;   // null＝還沒觀察到（第一次顯示時補問一次）
  function hookClanBuff() {
    if (typeof getClanBuffStats !== 'function') return;
    var orig = getClanBuffStats;
    window.getClanBuffStats = function (p) {
      var r = orig.apply(this, arguments);
      // 傭兵重算也會呼叫（p＝該傭兵）→ 只認玩家自己那次
      if (p == null || (typeof player !== 'undefined' && p === player)) _clanOn = !!r;
      return r;
    };
  }
  function clanActive() {
    if (_clanOn === null) { try { _clanOn = !!getClanBuffStats(); } catch (e) { _clanOn = false; } }
    return _clanOn;
  }

  // ── 套裝:門檻取自核心原始碼,名稱取自 DB.sets ────────────────────────
  var _thr = null;
  function thresholds() {
    if (_thr) return _thr;
    _thr = {};
    try {
      var re = /setCheck\[['"]([A-Za-z_0-9]+)['"]\]\s*>=\s*(\d+)/g, src = String(recomputeStats), m;
      while ((m = re.exec(src))) { var n = +m[2]; if (!_thr[m[1]] || n < _thr[m[1]]) _thr[m[1]] = n; }   // 同一組有多階時取最低（＝開始有效果的那階）
    } catch (e) {}
    if (!Object.keys(_thr).length) console.warn('[AFK-buffinfo] 讀不到核心的套裝件數門檻（上游可能改了 recomputeStats 的寫法），狀態欄不顯示套裝。');
    return _thr;
  }
  // 套裝代碼 → 中文名:DB.sets 反查（舊 14 組）,名字只掛在各件裝備 set 欄位上的較新幾組補在這裡
  //   （同 afk-wiki 的 EQ_SET_CN_EXTRA;上游再新增而這裡沒補時退回第一件裝備的名字,不會露英文代碼）
  var SET_CN_EXTRA = {
    orin: '歐林西瑪套裝', icequeen_charm: '冰之女王魅力套裝', frost: '寒冰套裝',
    bluepirate: '藍海賊套裝', emperor: '真．冥皇套裝', priest: '司祭苦行套裝'
  };
  var _cn = null;
  function setName(code) {
    if (!_cn) {
      _cn = {};
      try {
        for (var k in DB.sets) {
          var s = DB.sets[k]; if (!s || !s.items) continue;
          for (var i = 0; i < s.items.length; i++) { var d = DB.items[s.items[i]]; if (d && d.set && !_cn[d.set]) _cn[d.set] = s.n; }
        }
      } catch (e) {}
      for (var e2 in SET_CN_EXTRA) if (!_cn[e2]) _cn[e2] = SET_CN_EXTRA[e2];
    }
    if (_cn[code]) return _cn[code];
    try { for (var id in DB.items) if (DB.items[id].set === code) return '套裝：' + DB.items[id].n; } catch (e3) {}
    return code;
  }
  // 換裝才會變 → 每秒重算一次就夠（狀態欄每 0.1 秒重畫一次,不必跟著掃裝備欄）
  var _sets = [], _setsAt = 0;
  function activeSets() {
    var now = Date.now();
    if (now - _setsAt < 1000) return _sets;
    _setsAt = now;
    _sets = [];
    var thr = thresholds(); if (!Object.keys(thr).length) return _sets;
    var cnt = {}, seen = {};
    for (var k in player.eq) {
      var e = player.eq[k]; if (!e || seen[e.id]) continue;
      var d = DB.items[e.id]; if (!d || !d.set) continue;
      seen[e.id] = 1;                                        // 同款物品只算一件（同核心計件）
      cnt[d.set] = (cnt[d.set] || 0) + 1;
    }
    for (var s in cnt) if (thr[s] && cnt[s] >= thr[s]) _sets.push(setName(s));
    return _sets;
  }

  // ── 要補哪幾格 ────────────────────────────────────────────────────
  function rows() {
    var out = [];
    if (!alive()) return out;
    if (player.buffs && (player.buffs.sk_set_dragonscion || 0) > 0) {
      out.push({ t: (typeof BUFF_NAMES !== 'undefined' && BUFF_NAMES.sk_set_dragonscion) || '龍裔', c: 'text-orange-300' });
    }
    if (clanActive()) out.push({ t: '血盟Buff', c: 'text-emerald-300' });
    var s = activeSets();
    for (var i = 0; i < s.length; i++) out.push({ t: s[i], c: 'text-amber-400' });   // 琥珀金＝裝備分頁套裝欄位的框光同色
    return out;
  }

  function append() {
    var el = document.getElementById('dt-buffs');
    if (!el || el.querySelector('.afk-buffinfo')) return;   // 沒有面板／本輪已補過就不做
    var list = rows(); if (!list.length) return;

    // 「狀態: 正常」＝沒有任何增益 → 把「正常」讓給我們這幾格
    var first = el.firstChild, sep = ' / ';
    if (first && first.nodeType === 3 && /正常\s*$/.test(first.nodeValue)) {
      first.nodeValue = first.nodeValue.replace(/正常\s*$/, '');
      sep = '';
    }
    var abnormal = el.querySelector('div');   // 下方的「異常:」區塊（可能不存在）→ 要插在它前面
    for (var i = 0; i < list.length; i++) {
      if (sep) el.insertBefore(document.createTextNode(sep), abnormal || null);
      sep = ' / ';
      var sp = document.createElement('span');
      sp.className = 'afk-buffinfo font-bold ' + list[i].c;
      sp.textContent = list[i].t;
      el.insertBefore(sp, abnormal || null);
    }
  }

  function init() {
    if (typeof window.renderStatusEffects !== 'function') {
      console.warn('[AFK-buffinfo] 找不到 renderStatusEffects（上游可能改名），狀態欄補充停用。');
      return;
    }
    hookClanBuff();
    var orig = window.renderStatusEffects;
    window.renderStatusEffects = function () {
      var r = orig.apply(this, arguments);
      if (typeof state !== 'undefined' && state.ff) return r;   // 離線補跑期間不動畫面（原函式同樣早退）
      if (on()) { try { append(); } catch (e) {} }
      return r;
    };
    console.log('[AFK-buffinfo] hooks OK — 狀態欄補上龍裔／血盟 Buff／生效中套裝。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
