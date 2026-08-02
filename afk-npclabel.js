/* ============================================================================
 * afk-npclabel.js — 村莊 NPC 的名牌不要跑出畫面外
 *
 * 問題(玩家回報·已重現):炎魔謁見所的「炎魔的輔佐官」名字看不到。
 *   量出來的原因是**上方出界**,不是左右:名牌是貼在 NPC 立繪的正上方
 *   (css/style.css 的 .tn-label:bottom:100% + margin-bottom),而這位站得高(y=32%)、
 *   立繪又特別高 → 名牌整個跑到地圖頂端**外面** 68px,被上面的面板蓋掉。
 *   ⚠️ 這與視窗寬度無關:實測 1400 / 1024 / 860 三種寬度都一樣差 68px(所以不是「窄視窗才有」)。
 *
 *   核心的 _resolveTownLabelOverlap 只在「為了閃開別的名牌而往上抬」時檢查地圖頂端,
 *   **名牌自己天生就在頂端外**的情況它不管(那不是它抬上去的)。
 *
 * 作法:包住核心那支,等它排完之後把每個名牌夾回「地圖與視窗的交集」內——
 *   上方出界 → 調 margin-bottom 把它往下壓(與核心同一個位移管道,不會互相打架);
 *   左右出界 → 用 translateX 微調(順手處理:名字長又站得靠邊的 NPC 同樣會被切,如視窗
 *   窄到 860px 時這位的名牌右緣就會超出瀏覽器)。
 *   視窗大小改變時重跑一次(核心不會為了 resize 重排名牌)。
 *
 * 優雅降級:找不到那支核心函式就 console.warn 後安靜停用,不影響遊戲。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) {
    AFK_TOGGLES.register({
      id: 'npclabel', name: '村莊名牌不出界', group: '遊戲介面', def: true,
      desc: '村莊裡站得高或靠邊的 NPC，名字不會跑到畫面外'
    });
    if (!AFK_TOGGLES.enabled('npclabel')) return;
  }

  var PAD = 4;   // 離邊緣留一點縫,不要貼死

  function clamp() {
    var map = document.getElementById('town-npc-map');
    if (!map || map.classList.contains('hidden')) return;
    var mr = map.getBoundingClientRect();
    if (!mr.width) return;
    // 看得見的範圍＝地圖 ∩ 視窗(窄視窗時地圖自己就有一截在畫面外)
    var minX = Math.max(mr.left, 0) + PAD;
    var maxX = Math.min(mr.right, window.innerWidth || mr.right) - PAD;
    var minY = Math.max(mr.top, 0) + PAD;
    // 核心量位移時會除以縮放比,這裡沿用同一套(地圖被 CSS 縮放時才不會壓過頭)
    var scale = (mr.width / (map.offsetWidth || mr.width)) || 1;

    var labels = map.querySelectorAll('.town-npc .tn-label');
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i], r;

      // ① 上方出界 → 往下壓。走 margin-bottom(與核心同一個管道),不要另外加 transform 打架
      r = l.getBoundingClientRect();
      if (r.height && r.top < minY) {
        var cur = parseFloat(getComputedStyle(l).marginBottom) || 0;
        l.style.marginBottom = (cur - (minY - r.top) / scale) + 'px';
      }

      // ② 左右出界 → 用 translateX 微調(核心沒用到 transform 以外的水平位移)
      l.style.transform = '';                       // 先歸零再量,否則會疊加上一次的位移
      r = l.getBoundingClientRect();
      if (!r.width || maxX <= minX) continue;
      var dx = 0;
      if (r.right > maxX) dx = maxX - r.right;      // 右邊出界 → 往左推
      if (r.left + dx < minX) dx = minX - r.left;   // 推完換左邊出界(名牌比可視範圍還寬)→ 靠左對齊
      if (dx) l.style.transform = 'translateX(calc(-50% + ' + Math.round(dx) + 'px))';
    }
  }

  function init() {
    if (typeof window._resolveTownLabelOverlap !== 'function') {
      console.warn('[AFK-npclabel] 找不到核心的名牌排版函式，名牌防出界停用（遊戲照常運作）。');
      return;
    }
    if (window._resolveTownLabelOverlap.__afkNpcLabel) return;
    var orig = window._resolveTownLabelOverlap;
    window._resolveTownLabelOverlap = function () {
      var r = orig.apply(this, arguments);
      try { clamp(); } catch (e) {}   // 純視覺,出錯不影響遊戲
      return r;
    };
    window._resolveTownLabelOverlap.__afkNpcLabel = true;

    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { try { clamp(); } catch (e) {} }, 120);
    });

    console.log('[AFK-npclabel] hooks OK — 村莊 NPC 名牌會夾在畫面內。');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
