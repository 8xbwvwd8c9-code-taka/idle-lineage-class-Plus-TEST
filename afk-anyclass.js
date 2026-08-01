/* ============================================================================
 * afk-anyclass.js — 去除裝備的職業與性別限制（預設關）
 *
 * 開啟後:武器/防具/飾品(含遺物)一律不看職業與性別,任何角色都能裝
 *   (法師拿雙手劍、戰士拿弓、男角穿「冰之女王魅力禮服」…)。
 *
 * 作法:核心的裝備資格判定只有一個入口 —— js/08 的 checkCanEquip(裝備、背包紅底、
 *   物品視窗的「裝備」鈕、飾品商店清單、傭兵能不能穿隊長的裝備,全都問它)。本檔包住它,
 *   **只在它執行的那一瞬間**把兩道閘拿掉、跑完立刻還原:
 *     ① 職業:reqAllowsClass / darkEquipOk / illusionEquipOk / dragonEquipOk / warriorEquipOk / royalEquipOk 一律放行
 *     ② 性別:把該件的 d.reqAvatar 暫時拿掉(核心是寫死在 checkCanEquip 裡的 if,沒有函式可換)
 *   這樣做的理由是**不重寫規則**:遺物、負重強化、劍術精通例外全部照作者原本的邏輯跑,
 *   上游改規則我們自動跟著改;我們只讓「職業」與「性別」那兩關永遠過。
 *   ⚠️ 反過來說,絕不可把 reqAllowsClass 永久換掉 —— 它同時管職業限定藥水(慎重/勇敢/精靈餅乾)
 *   與物品資訊框的「適用職業」圖示,永久換掉會連那些一起解除、資訊框也會變成全職業都能用。
 *   同理 d.reqAvatar 是 DB 共用資料,只在這一次呼叫內拿掉、finally 一定放回去。
 *
 * 已知的連帶效果(都是「同一個判定」的必然結果,不是 bug):
 *   ・飾品商店會列出原本職業不符而看不到的飾品(武器/防具本來就全列)。
 *   ・傭兵也能穿隊長給的跨職業裝備(核心用同一支 checkCanEquip 判隊員)。
 *   ・關掉本外掛後再讀檔,核心會把「現在穿不上的」自動卸回背包(作者原本就有的機制,
 *     訊息寫的是「因負重強化改版」;裝備只是回背包,不會消失)。
 *
 * 掛接:在 index.html 的 </body> 前 <script src="afk-anyclass.js">。
 * ========================================================================== */
(function () {
  'use strict';

  // ⚠️ 這支預設「關」,所以讀不到 AFK_TOGGLES 時要當**關閉**——不可沿用其他外掛那條
  //    「讀不到就當開啟」(那是給預設開的外掛用的,套在這裡會變成沒有開關就自動改動遊戲規則)。
  function on() { return !!(window.AFK_TOGGLES && AFK_TOGGLES.enabled('anyclass')); }

  // 職業那幾關(js/08):checkCanEquip 執行期間暫時一律放行;不在的就跳過(上游改名不會壞)
  var CLASS_GATES = ['reqAllowsClass', 'darkEquipOk', 'illusionEquipOk', 'dragonEquipOk', 'warriorEquipOk', 'royalEquipOk'];
  function pass() { return true; }

  function init() {
    if (typeof window.checkCanEquip !== 'function') {
      console.warn('[AFK-anyclass] 找不到核心 checkCanEquip,裝備職業限制解除停用。');
      return;
    }
    var origCheck = window.checkCanEquip;
    window.checkCanEquip = function (item) {
      if (!on()) return origCheck.apply(this, arguments);
      var saved = [];
      CLASS_GATES.forEach(function (n) {
        if (typeof window[n] !== 'function') return;
        saved.push([n, window[n]]);
        window[n] = pass;
      });
      // 性別那關寫死在 checkCanEquip 內,沒有函式可換 → 只好把這一件的 reqAvatar 暫時拿掉
      //    ⚠️ DB 是 `const DB`(js/00),**不會**掛上 window → 只能 `typeof DB` 探,寫 window.DB 一律 undefined
      //       (踩過:寫成 window.DB 時整段安靜不生效,職業解除了、性別那 4 件還是穿不上)
      var d = null, avatarReq;
      try { d = (item && typeof DB !== 'undefined' && DB.items) ? DB.items[item.id] : null; } catch (e) {}
      if (d && d.reqAvatar) { avatarReq = d.reqAvatar; d.reqAvatar = ''; }
      try { return origCheck.apply(this, arguments); }
      finally {   // 一定還原,原函式丟例外也一樣
        saved.forEach(function (kv) { window[kv[0]] = kv[1]; });
        if (avatarReq !== undefined) d.reqAvatar = avatarReq;
      }
    };

    console.log('[AFK-anyclass] hooks OK — 裝備職業/性別限制解除（預設關，於外掛開關面板開啟）。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
