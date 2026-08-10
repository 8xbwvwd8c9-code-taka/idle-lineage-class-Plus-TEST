/* ============================================================================
 * afk-anccarry.js — 製作／精煉時，把「被當成本體吃掉的那件裝備」的遠古系詞綴帶到成品上
 *
 * 為什麼要做：上游只替**祝福**寫了傳承（js/14 consumeMaterialById 累加 _craftBlessCount →
 *   doCraft 讓前幾件成品強制祝福，並印「✦ 使用了祝福的裝備作為材料」），遠古系
 *   （遠古/永恆/不朽/太初）沒有對應的路 → 成品是 gainItem 全新生出來的，anc 是空的。
 *   於是「太初 祝福的 冰之女王的耳環 Lv0」精煉成 Lv1 之後，**祝福留著、太初不見了**
 *   （玩家回報，已重現）。而遠古系在我方是靠 afk-ancdrop 補回來的正常產出，
 *   不是絕版遺產 → 升級就蒸發等於逼玩家「永遠停在 Lv0」，這條路本來是死的。
 *   本外掛只補「傳承」一件事，讓遠古系跟祝福的行為對齊。
 *
 * 範圍：**配方裡 cnt=1 的裝備類材料＝本體**（全 repo 掃過共 103 條配方符合）。
 *   刻意不限縮成「id 有 _0/_1 編號的升級鏈」——那只抓得到冰之女王耳環那 36 條，
 *   而武官雙手劍→真．冥皇執行劍、黑暗鋼爪→銀光鋼爪、地龍鱗盔甲→古代地龍鱗盔甲…
 *   在語意上一樣是升級，漏掉它們會生出「耳環會留、其他不留」這種說不清的不一致。
 *   ⚠ 這遊戲沒有「拿裝備純粹湊數」的配方，所以放寬到 103 條不會變成洗詞綴管道。
 *
 * 怎麼知道「實際被吃掉的是哪一件」：包 consumeMaterialById，在它前後各掃一次該 id 的
 *   堆疊（背包＋倉庫）做 diff。**刻意不自己複製核心那套「白板/低強化優先」的挑選排序**
 *   （js/14:1025 與 whConsumeId 兩份，權重含 en/anc/bless/attr/seteff）——照抄就等於多一份
 *   會跟上游走鐘的規則，diff 則是上游怎麼挑、我們就怎麼認。
 *
 * 發放：跟祝福同一套「件數對件數」——吃掉幾件帶詞綴的本體，前幾件成品就帶（依消耗順序）。
 *
 * 材料帶什麼、成品就是什麼（太初進、太初出）。核心對祝福的做法是「先照常
 *   rollAffixesNew()，骰完再 `if (_forceBless) bless = true`」（js/08:121-125）——擲骰一直有跑，
 *   保底是事後蓋上去的；這裡照同一個順序，只是蓋的是材料原本那個詞綴。
 *
 * ⚠️ **遠古／永恆／不朽／太初是平級的四種風格，不是四個等級**，所以不可以「取較高階」：
 *   applyAncStats(js/08) 武器＝永恆傷害+4／不朽命中+4／太初魔傷+2，防具＝永恆 AC-2／
 *   不朽迴避+2／太初魔防+4，各有各的用途；afk-ancdrop 的權重也是各 25% 均等。
 *   ⭐ 別被 `ancientSortRank`(js/10) 騙了——那支是**背包排序用的顯示順序**，名字裡的 rank
 *   讓人以為有強弱（本外掛第一版就是這樣寫成「取較高階」）。比大小的後果是玩家的太初
 *   會被隨機換成永恆＝詞綴被洗掉，正是這支外掛要防的事。
 *
 * 與 afk-ancdrop 的關係：兩支都包 rollAffixesNew，但**誰先載入都不影響結果**——
 *   材料有詞綴就用材料的；材料沒有就原樣放行，讓 ancdrop 骰出來的結果留著。
 *
 * ⚠ 只在 doCraft 執行期間生效（_watch 旗標），一般掉落完全不碰。
 *   核心自動補製中間物（ensureMaterial）走 forceNormal＝不附詞綴的路，不會進到 rollAffixesNew；
 *   且順序是「補製→扣材料→產出」，_carry 收集完才輪到成品，中間物拿不走。
 * ⚠ CRAFT_RECIPES / DB 是頂層 const＝不掛 window，一律裸名＋typeof 讀（寫 window.X 會靜默拿到 undefined）。
 *
 * 掛接：在 index.html 的 </body> 前 <script src="afk-anccarry.js">。
 * ========================================================================== */
(function () {
    'use strict';

    if (window.AFK_TOGGLES) AFK_TOGGLES.register({
        id: 'anccarry', name: '製作保留遠古系詞綴', group: '遊戲玩法', def: true,
        desc: '拿帶遠古／永恆／不朽／太初的裝備去製作或精煉，成品會保留該詞綴（和祝福一樣）'
    });

    function enabled() { return !window.AFK_TOGGLES || AFK_TOGGLES.enabled('anccarry'); }

    if (typeof window.doCraft !== 'function' || typeof window.consumeMaterialById !== 'function'
        || typeof window.rollAffixesNew !== 'function') {
        console.warn('[AFK-anccarry] 找不到 doCraft／consumeMaterialById／rollAffixesNew，遠古系傳承停用（製作照常）。');
        return;
    }
    if (window.doCraft.__afkAncCarry) { console.log('[AFK-anccarry] hooks OK'); return; }   // 冪等：重複載入不疊包

    var _watch = null;   // 本次製作要盯的「本體」id 清單；null＝不在製作中
    var _carry = [];     // 這次實際吃掉的本體身上的遠古系詞綴（依消耗順序）

    function isGear(id) {
        if (typeof DB === 'undefined' || !DB.items) return false;
        var d = DB.items[id];
        return !!d && (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc');
    }

    // 該 id 目前在背包＋倉庫的所有堆疊：uid → { cnt, anc }
    function snap(id) {
        var m = {}, i, it;
        try {
            var inv = (typeof player !== 'undefined' && player && player.inv) || [];
            for (i = 0; i < inv.length; i++) { it = inv[i]; if (it && it.id === id && it.uid != null) m[it.uid] = { cnt: it.cnt || 1, anc: it.anc || false }; }
        } catch (e) {}
        try {
            var w = (typeof loadWarehouse === 'function') ? loadWarehouse() : null;
            var wi = (w && w.items) || [];
            // ⚠ 倉庫與背包可能出現同一個 uid（玩家存檔實際存在共用 uid 的損壞）→ 用前綴分開記，不要互相蓋掉
            for (i = 0; i < wi.length; i++) { it = wi[i]; if (it && it.id === id && it.uid != null) m['w:' + it.uid] = { cnt: it.cnt || 1, anc: it.anc || false }; }
        } catch (e) {}
        return m;
    }

    // diff：把「消失或變少」的件數中帶遠古系的收進 _carry
    function collect(before, after) {
        for (var k in before) {
            var b = before[k], a = after[k];
            var gone = b.cnt - (a ? a.cnt : 0);
            if (gone <= 0 || !b.anc) continue;
            for (var i = 0; i < gone; i++) _carry.push(b.anc);
        }
    }

    var _origConsume = window.consumeMaterialById;
    window.consumeMaterialById = function (id, n) {
        if (!_watch || !enabled() || _watch.indexOf(id) < 0) return _origConsume.apply(this, arguments);
        var before = snap(id);
        var r = _origConsume.apply(this, arguments);
        try { collect(before, snap(id)); } catch (e) {}
        return r;
    };

    var _origRoll = window.rollAffixesNew;
    window.rollAffixesNew = function () {
        var r = _origRoll.apply(this, arguments);   // afk-ancdrop 可能已在這裡骰出遠古系
        try {
            if (_watch && enabled() && r && _carry.length) {
                // 一次做多件時「件數對件數」發（同祝福）：依材料被吃掉的順序配給成品。
                var carried = _carry.shift();
                // 材料帶什麼就是什麼——玩家原本是太初，升級後還是太初。
                // ⚠️ 不要拿 ancientSortRank 去「取較高階」：那支是**背包排序用的顯示順序**，
                //    名字裡的 rank 會讓人以為有強弱。四者其實平級（applyAncStats：武器＝
                //    永恆傷害+4／不朽命中+4／太初魔傷+2，是三種風格不是三個等級；afk-ancdrop
                //    也是各 25% 均等）。比大小的話，玩家的太初會被隨機換成永恆＝詞綴被洗掉。
                r.anc = carried;
            }
        } catch (e) {}
        return r;
    };

    var _origCraft = window.doCraft;
    window.doCraft = function (npcId, recipeIdx) {
        if (!enabled() || typeof CRAFT_RECIPES === 'undefined') return _origCraft.apply(this, arguments);
        var prevW = _watch, prevC = _carry;
        try {
            var rec = CRAFT_RECIPES[npcId] && CRAFT_RECIPES[npcId][recipeIdx];
            var ids = [];
            if (rec && rec.req) for (var i = 0; i < rec.req.length; i++) {
                var q = rec.req[i];
                if (q && q.cnt === 1 && isGear(q.id)) ids.push(q.id);   // cnt=1 的裝備類＝本體
            }
            _watch = ids; _carry = [];
            return _origCraft.apply(this, arguments);
        } finally {
            _watch = prevW; _carry = prevC;
        }
    };
    window.doCraft.__afkAncCarry = true;

    console.log('[AFK-anccarry] hooks OK — 製作／精煉會把本體的遠古系詞綴帶到成品。');
})();
