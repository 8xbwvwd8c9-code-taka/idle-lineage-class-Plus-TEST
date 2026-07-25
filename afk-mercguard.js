/* ============================================================================
 * afk-mercguard.js — 傭兵招募被擋下時跳彈窗（原版只寫系統日誌，玩家看不到）
 *
 * 為什麼需要（2026-07-25 玩家回報）：核心 toggleAlly 擋下招募時只 logSys 一行紅字，
 *   而且下一行馬上被「遊戲進度已儲存。」推走 → 玩家盯著召喚視窗只會看到「點了沒反應」。
 *   踩到的實例：該角色正擔任自己的安塔瑞斯助戰者（換另一隻角色去招募就正常，極難自己想到）。
 *   另一種同樣安靜的是「協力傭兵已達上限」（非王族 3 名、王族 3＋魅力/15）。
 *
 * 做法：不重刻任何擋下條件（必漏、必分歧）——招募期間暫時包住 logSys 收集訊息，
 *   事後比對「傭兵數有沒有增加」；沒增加就把**核心自己吐的那句紅字原文**丟進彈窗。
 *   上游改文案或新增擋下條件，這裡自動跟著變。
 *
 * 另外：核心對「已受僱於別人」的列不給召喚鈕（顯示原因），但「擔任助戰者」的列照樣給一顆
 *   能按的鈕 → 補齊這個不一致：render 後把那幾列的鈕換成「可點的說明」（點下去仍走 toggleAlly，
 *   所以彈窗照跳；不做成死文字，否則玩家連個可按的東西都沒有）。
 *
 * 掛接：包 toggleAlly / renderAllyNPC（都是全域函式）。缺任一個就 warn 後停用。
 * ========================================================================== */
(function () {
  'use strict';

  function enabled() { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('mercguard'); }

  if (window.AFK_TOGGLES) {
    AFK_TOGGLES.register({
      id: 'mercguard', name: '傭兵招募擋下提示', def: true, group: '遊戲介面',
      desc: '招募傭兵被擋下時跳彈窗說明原因（擔任助戰者／人數已滿…），不再只寫在系統日誌'
    });
  }

  function strip(html) {
    return String(html == null ? '' : html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').trim();
  }
  //   純告知用單鈕彈窗:直接呼叫 alert——afk-ui 已把 window.alert 接管成自製彈窗(手機也吃返回鍵關閉);
  //   不用 AFK_UI.confirm,那是二選一的框、會多一顆沒有意義的「取消」。
  function popup(msg) { try { alert(msg); } catch (e) {} }

  function wrapToggle() {
    var orig = window.toggleAlly;
    window.toggleAlly = function (slotN) {
      if (!enabled() || typeof isAllyActive !== 'function') return orig.apply(this, arguments);
      var wasActive = false;
      try { wasActive = isAllyActive(slotN); } catch (e) {}
      if (wasActive) return orig.apply(this, arguments);   // 解散不管
      var before = (player && player.allies) ? player.allies.length : 0;
      var caught = [];
      var _log = window.logSys;
      if (typeof _log === 'function') {
        window.logSys = function (msg) { caught.push(msg); return _log.apply(this, arguments); };
      }
      try {
        return orig.apply(this, arguments);
      } finally {
        if (typeof _log === 'function') window.logSys = _log;
        var after = (player && player.allies) ? player.allies.length : 0;
        if (after === before) {   // 沒招募成功 → 把核心自己給的理由推到玩家面前
          var reason = '';
          for (var i = caught.length - 1; i >= 0; i--) {
            if (/text-red-400/.test(String(caught[i]))) { reason = strip(caught[i]); break; }
          }
          if (reason) popup(reason);
        }
      }
    };
  }

  // 「擔任助戰者」的列比照核心對「已受僱於別人」的處理:不給可按的召喚鈕,直接寫原因。
  function markHelperRows(div) {
    var slots;
    try { slots = (typeof antharasHelperSlots === 'function') ? antharasHelperSlots().map(String) : []; } catch (e) { return; }
    if (!slots.length || !div) return;
    Array.prototype.forEach.call(div.querySelectorAll('button[onclick]'), function (b) {
      var m = /toggleAlly\('([^']+)'\)/.exec(b.getAttribute('onclick') || '');
      if (!m || slots.indexOf(String(m[1])) < 0) return;
      // ⚠ 換成「可點的說明」而不是死文字:點下去照樣走 toggleAlly → 由上面的包裝吐出核心原文彈窗。
      //   純文字會讓玩家連個可按的東西都沒有,反而更難確認自己不是誤觸。
      var slot = String(m[1]);
      var s = document.createElement('span');
      s.className = 'text-xs px-2 text-right';
      s.style.cssText = 'color:#fbbf24;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;';
      s.title = '正擔任你的安塔瑞斯助戰者；點一下看怎麼解除。';
      s.innerHTML = '擔任安塔瑞斯助戰者<br>不可招募（點我說明）';
      s.addEventListener('click', function () { try { window.toggleAlly(slot); } catch (e) {} });
      if (b.parentNode) b.parentNode.replaceChild(s, b);
    });
  }

  function wrapRender() {
    var orig = window.renderAllyNPC;
    window.renderAllyNPC = function (div) {
      var r = orig.apply(this, arguments);
      if (enabled()) { try { markHelperRows(div); } catch (e) {} }
      return r;
    };
  }

  function init() {
    if (typeof window.toggleAlly !== 'function' || typeof window.renderAllyNPC !== 'function') {
      console.warn('[AFK-mercguard] 缺 toggleAlly/renderAllyNPC，停用');
      return;
    }
    wrapToggle();
    wrapRender();
    console.log('[AFK-mercguard] hooks OK');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
