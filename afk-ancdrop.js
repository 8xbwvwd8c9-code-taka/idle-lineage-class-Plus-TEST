/* ============================================================================
 * afk-ancdrop.js — 遠古系裝備的兩個來源：金卡怪掉落、以及「該分類收集滿」後的非擊殺取得
 *
 * 為什麼做得起來：遠古系在遊戲裡是「絕版」而不是「不存在」——物品的 anc 欄位、四階
 *   效果(js/08 applyAncStats)、名稱前綴配色、道具說明、背包排序、堆疊簽章、廢品標記
 *   全都還在，只有「產生」那一步被上游關掉了：js/07 rollAffixesNew 恆回 anc:false
 *   （註解說改由象牙塔碧恩取得，但那三張賦予卷軸早已標成 noUse＝無用途）。
 *   全 repo 沒有任何地方會把 anc 設成 true → 玩家手上的遠古裝備都是舊存檔遺產。
 *   所以這支只補「來源」一件事，其餘全部沿用核心既有支援。
 *
 * 規則（兩個來源共用同一套機率與階級，都以「與祝福相同的機率」擲、四階各 25%）：
 *   ① 擊殺掉落——該怪的卡片收集冊已開到金階(cardDexTier>=3)。
 *   ② 非擊殺取得（製作、兌換、任務獎勵…）——**該物品自己所屬的裝備收集冊分類已全收集**
 *      (js/16 equipCatComplete)。分類全收集本來就有永久加成(EQUIP_CAT_BONUS)，玩家早就在
 *      追這件事，這是第二層獎勵。
 *      ⭐ 條件寫成「不是打怪掉的」而不是逐條列來源（製作、職業試煉、50 級試煉、傭兵試煉…）：
 *        逐條掛鉤漏掉一條就會出現「原版兌換會出遠古、外掛批次兌換不會」這種說不清的不一致，
 *        而每次上游加新兌換都要再補一條。通則只有一句話，玩家也記得住。
 *   ⭐ 機率不自己訂死，直接用核心傳進 rollAffixesNew 的第一參 baseChance
 *   （js/08 gainItem 給的是「一般怪 1%、頭目 10%、製作 10%、其餘來源 1%」）→ 上游哪天調整
 *   祝福率，這裡自動跟著，不必兩邊各記一份數字。席琳倍率是原函式內部算的、拿不到，故不套用。
 *
 * ⚠️ 要認「正在產生的那件東西」，所以另包 gainItem 記下當下的 id：rollAffixesNew 自己不知道
 *   在替哪件東西擲。核心自動補製的中間物走的是「不附詞綴」的路（forceNormal），本來就不會
 *   進到這裡，不必另外排除。
 *
 * 掛接：包 rollAffixesNew（核心決定「這件掉落品要不要祝福」的唯一入口）。
 *   ⭐ 只包這一個點就涵蓋全部路徑——一般掉落(js/08 gainItem)、血盟/攻城掉寶(js/04)、
 *   以及離線結算（afk-offline 是 1:1 重放核心 killMob，走同一條路）→ 不會有
 *   「線上有、離線沒有」的分歧。gainItem 拿到 anc 之後，顯示/計算/堆疊/廢品全自理。
 *
 * 🚨 為什麼「沒開金卡就一次骰都不擲」：掉落亂數是 committed RNG（lootRng 吃存檔內的
 *   player.lootSeq 遞增序號，防存讀檔重抽）。多消耗一個序號會改變**之後所有掉落**的結果，
 *   所以判斷順序必須是「先確認已金卡，才呼叫 lootRng」——否則光是裝了這支外掛，
 *   沒開任何金卡的玩家掉落序列也會整個位移。命中後才擲第二次（決定階級），同理。
 *
 * 🚨 怪名要先過 CARD_DROP_ALIAS：變身鏈（玉藻/九尾→殺生石、安塔瑞斯後續階）的卡掛在
 *   鏈根那隻名下，直接拿 mob.n 去查 cardDex 會查不到 → 打倒最終階時安靜失效。
 *
 * ⚠️ 同步上游時要看一眼：若上游哪天自己恢復遠古掉落，會與本外掛疊加。
 * ========================================================================== */
(function () {
    'use strict';

    // 階級權重（總和 100）。true＝基礎「遠古」，其餘為 js/08 ancName 認得的變體 key。
    var TIER_WEIGHTS = [[true, 25], ['eternal', 25], ['immortal', 25], ['primordial', 25]];

    if (window.AFK_TOGGLES) AFK_TOGGLES.register({
        id: 'ancdrop', name: '遠古系裝備來源', group: '遊戲玩法', def: true,
        desc: '金卡怪掉落的裝備、以及該分類已收集滿時製作或兌換到的裝備，有機會帶遠古系詞綴'
    });

    if (typeof window.rollAffixesNew !== 'function') {
        console.warn('[AFK-ancdrop] 找不到 rollAffixesNew，遠古掉落停用（遊戲照常運作）。');
        return;
    }
    if (window.rollAffixesNew.__afkAncDrop) { console.log('[AFK-ancdrop] hooks OK'); return; }   // 冪等：重複載入不疊包

    function enabled() { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('ancdrop'); }

    function pickTier(r) {
        var acc = 0, total = 0, i;
        for (i = 0; i < TIER_WEIGHTS.length; i++) total += TIER_WEIGHTS[i][1];
        var x = r * total;
        for (i = 0; i < TIER_WEIGHTS.length; i++) { acc += TIER_WEIGHTS[i][1]; if (x < acc) return TIER_WEIGHTS[i][0]; }
        return true;
    }

    // 這次掉落的來源怪是否已開金卡（不是擊殺掉落＝商店/製作/兌換時，_lootMobInfo 為 null）
    function goldCardMob() {
        var mi = (typeof _lootMobInfo !== 'undefined') ? _lootMobInfo : null;
        if (!mi || !mi.n || typeof cardDexTier !== 'function') return null;
        var nm = (typeof CARD_DROP_ALIAS !== 'undefined' && CARD_DROP_ALIAS[mi.n]) || mi.n;
        return cardDexTier(nm) >= 3 ? mi : null;
    }

    // ── 來源②：非擊殺取得，且該物品自己的分類已全收集 ──────────────────
    // ⚠️ EQUIP_ITEM_CAT / equipCatComplete 在核心是 const/function 宣告＝不在 window 上，用裸名讀
    function catDone(id) {
        if (!id || typeof EQUIP_ITEM_CAT === 'undefined' || typeof equipCatComplete !== 'function') return false;
        var ck = EQUIP_ITEM_CAT[id];
        try { return !!ck && equipCatComplete(ck); } catch (e) { return false; }
    }
    var _gainId = null;   // gainItem 執行期間＝正在產生的物品 id

    // 「是不是打怪掉的」問核心的掉落來源上下文：擊殺期間 _lootMobInfo 有值，且 killMob 的 finally
    // 會清掉（核心註解寫明是為了不外洩到兌換/任務），所以 null＝非擊殺。離線走 afk-offline 1:1
    // 重放 killMob，一樣有值。
    // ⚠️ 這個判斷成立的前提是「發掉落的路徑都會設 _lootMobInfo」。上游那套統計式離線結算
    //   (js/27) 不設，但它自 v3.7.94 起已被上游從 index.html 移除、我方也沒載入；
    //   哪天它被加回來，這裡要一起重驗（否則離線掉落會被當成非擊殺、繞過金卡條件）——
    //   docs/offline.md 的「js/27 加回來要重測」清單裡有列。
    function nonKillAncOk() {
        if (typeof _lootMobInfo !== 'undefined' && _lootMobInfo) return false;
        return catDone(_gainId);
    }

    if (typeof window.gainItem === 'function' && !window.gainItem.__afkAncDrop) {
        var _origGain = window.gainItem;
        window.gainItem = function (id) {
            var prev = _gainId;
            _gainId = id;
            try { return _origGain.apply(this, arguments); } finally { _gainId = prev; }
        };
        window.gainItem.__afkAncDrop = true;
    }

    var _origRoll = window.rollAffixesNew;
    window.rollAffixesNew = function (baseChance) {
        var r = _origRoll.apply(this, arguments);
        try {
            if (enabled() && r && !r.anc && (goldCardMob() || nonKillAncOk())) {   // ⚠️ 先問條件，確定要抽了才動 lootRng（見檔頭）
                var p = Number(baseChance);
                if (!Number.isFinite(p)) p = 0.01;             // 無參呼叫（js/04 血盟掉寶）＝核心預設值
                p = Math.max(0, Math.min(1, p));
                if (p > 0 && lootRng('ancq') < p) r.anc = pickTier(lootRng('anct'));
            }
        } catch (e) { /* 任何意外都當作沒這功能：掉落絕不可因此壞掉 */ }
        return r;
    };
    window.rollAffixesNew.__afkAncDrop = true;

    // 收集冊頁首補一句——玩家正是在這裡決定「卡片要用在哪隻怪」，不講他不會知道金卡多了這個用途。
    if (typeof window.renderCardBook === 'function') {
        var _origBook = window.renderCardBook;
        window.renderCardBook = function () {
            var ret = _origBook.apply(this, arguments);
            if (enabled()) {
                try {
                    var host = document.getElementById('card-book-body');
                    var head = host && host.firstElementChild;
                    if (head && !host.querySelector('.afk-ancdrop-note')) {
                        head.insertAdjacentHTML('afterend',
                            '<div class="afk-ancdrop-note c-ancient text-sm mb-3">收集到金卡的怪，掉落的裝備有機會帶遠古系詞綴。</div>');
                    }
                } catch (e) { /* 說明沒插上不影響功能本體 */ }
            }
            return ret;
        };
    }

    // 裝備收集冊：玩家在這裡決定「要不要把這一類收滿」，不講他不會知道收滿還有這個用途。
    if (typeof window.renderEquipBook === 'function') {
        var _origEqBook = window.renderEquipBook;
        window.renderEquipBook = function () {
            var ret = _origEqBook.apply(this, arguments);
            if (enabled()) {
                try {
                    var host = document.getElementById('equip-book-body');
                    var head = host && host.firstElementChild;
                    var done = typeof _equipBookCat !== 'undefined' && typeof equipCatComplete === 'function' && equipCatComplete(_equipBookCat);
                    if (head && !host.querySelector('.afk-ancdrop-eqnote')) {
                        head.insertAdjacentHTML('afterend', '<div class="afk-ancdrop-eqnote c-ancient text-sm mb-3">'
                            + (done ? '已收集完成：製作或兌換到的這類裝備，有機會是遠古系。' : '收集完成後，製作或兌換到的這類裝備有機會是遠古系。') + '</div>');
                    }
                } catch (e) { /* 說明沒插上不影響功能本體 */ }
            }
            return ret;
        };
    }

    // 製作面板：在「已收集滿」的配方旁標一下，玩家才知道這條做下去可能出遠古（craftActionHtml 是五個製作 NPC 共用的那一段）
    if (typeof window.craftActionHtml === 'function' && !window.craftActionHtml.__afkAncDrop) {
        var _origAct = window.craftActionHtml;
        window.craftActionHtml = function (npcId, idx) {
            var html = _origAct.apply(this, arguments);
            try {
                if (!enabled()) return html;
                var rc = (typeof CRAFT_RECIPES !== 'undefined' && CRAFT_RECIPES[npcId]) ? CRAFT_RECIPES[npcId][idx] : null;
                if (rc && catDone(rc.result)) {
                    // 塞進最外層 <div> 的開頭當第一個子元素；比對不到就原樣返回（上游改了結構＝這個標記自己消失，製作照常）
                    html = html.replace(/^(\s*<div\b[^>]*>)/,
                        '$1<span class="c-ancient text-xs font-bold self-center" title="這個分類已收集完成，做出來有機會帶遠古系詞綴">✦遠古</span>');
                }
            } catch (e) { /* 標記沒加上不影響製作本體 */ }
            return html;
        };
        window.craftActionHtml.__afkAncDrop = true;
    }

    // 試煉面板：跟製作面板同一個道理——玩家站在這裡決定要不要換，不標他不會知道這一件可能出遠古。
    //   三個面板（職業 15/30/45、50 級、傭兵專屬）獎勵的寫法有兩種：前兩者包在
    //   <b class="text-sky-300">名稱</b> 裡，傭兵那份是「獎勵：甲、乙」的純文字 → 兩種各配一個錨點。
    //   錨不到就原樣返回（上游改寫法＝標記自己消失，面板照常用），與製作面板那個標記同一種失效方式。
    var ANC_TAG = '<span class="c-ancient text-xs font-bold" title="這個分類已收集完成，兌換到的有機會帶遠古系詞綴">✦遠古</span>';
    var _trialIds = null;
    function trialRewardIds() {   // 三個面板共用一份：多帶幾個不相干的 id 無害（是靠名字比對到才標）
        if (_trialIds) return _trialIds;
        var out = [];
        try { for (var k in TRIAL_Q) (TRIAL_Q[k].rewards || []).forEach(function (id) { out.push(id); }); } catch (e) {}
        try { for (var c in TRIAL_50_CFG) (TRIAL_50_CFG[c].rewards || []).forEach(function (r) { out.push(r.id || r); }); } catch (e) {}
        return (_trialIds = out);
    }
    function markTrialRewards(html) {
        if (!enabled() || typeof html !== 'string' || !html) return html;
        try {
            var names = {}, any = false;
            trialRewardIds().forEach(function (id) {
                var d = DB.items[id];
                if (d && d.n && !names[d.n] && catDone(id)) { names[d.n] = 1; any = true; }
            });
            if (!any) return html;
            for (var nm in names) {
                var b = '<b class="text-sky-300">' + nm + '</b>';
                if (html.indexOf(b) >= 0) html = html.split(b).join(b + ANC_TAG);
            }
            html = html.replace(/(獎勵：)([^<]+)(<\/div>)/g, function (m, head, list, tail) {
                return head + list.split('、').map(function (s) { return names[s] ? s + ANC_TAG : s; }).join('、') + tail;
            });
        } catch (e) { /* 標記沒加上不影響面板 */ }
        return html;
    }
    ['trialQHTML', 'build50TrialHTML'].forEach(function (fn) {
        if (typeof window[fn] !== 'function' || window[fn].__afkAncDrop) return;
        var o = window[fn];
        window[fn] = function () { return markTrialRewards(o.apply(this, arguments)); };
        window[fn].__afkAncDrop = true;
    });
    // 傭兵專屬任務面板是直接寫 div.innerHTML、不回傳字串 → 跑完再就地改寫。
    // 面板上的按鈕全是 inline onclick，重寫 innerHTML 不會弄丟事件。
    if (typeof window.renderAllyQuestManager === 'function' && !window.renderAllyQuestManager.__afkAncDrop) {
        var _origAllyQ = window.renderAllyQuestManager;
        window.renderAllyQuestManager = function (div) {
            var ret = _origAllyQ.apply(this, arguments);
            try {
                if (div && div.innerHTML) {
                    var next = markTrialRewards(div.innerHTML);
                    if (next !== div.innerHTML) div.innerHTML = next;
                }
            } catch (e) { /* 同上 */ }
            return ret;
        };
        window.renderAllyQuestManager.__afkAncDrop = true;
    }

    console.log('[AFK-ancdrop] hooks OK — 金卡怪掉落／分類收集滿後的非擊殺取得可帶遠古系詞綴。');
})();
