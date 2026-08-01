/**
 * afk-lzcache.js — 大資料重複處理的快取（兩層：解壓一層、血盟 Buff 查詢一層）
 *
 * 為什麼需要：核心把幾包大資料以 LZString 壓在 localStorage（血盟狀態、存檔、圖鑑…），
 * 而 killMob → pvpOnKillMob → npcClanMaybeStartGroupBattle 會在擲骰「要不要開血盟團戰」之前
 * 先 npcClanGetWorld() 讀整包血盟狀態——也就是**每殺一隻怪就完整解壓一次**。線上如此，離線
 * 結算更把它放大成瓶頸：24 小時結算 6 萬多隻怪 ≈ 10 萬次解壓，佔總耗時近八成。
 *
 * 【第一層】包住 LZString.decompressFromUTF16，用「壓縮字串 → 解壓字串」的 LRU 快取。
 *   兩端都是不可變字串、函式本身是純函式 → 快取不可能改變任何遊戲行為；
 *   有人寫過那個 key（localStorage 內容變了）→ 壓縮字串不同 → 自動未命中重算，不需失效通知。
 *   實測（真實存檔 mageLv97 sunrise_east，24h 離線結算）：43.3s → 10.9s。
 *   另跑過對照組：用快取值但每次仍真解壓一遍比對，近 19 萬次比對 0 次不符。
 *
 * 【第二層】包住 getClanBuffStats——解壓被快取之後，剩下的成本是「每次都把解開的 242KB
 *   血盟 JSON 重新 JSON.parse 一次、再整份正規化一次」，那兩步第一層蓋不到。
 *   recomputeStats() 每次都會問一次血盟 Buff，而重算在某些配裝下是逐殺發生的
 *   （見 apply-core-patches 補丁 9：吉爾塔斯魔杖）→ 同樣被放大成離線結算的大宗。
 *   細節見下方該段的註解。
 */
(function () {
    'use strict';
    if (window.AFK_TOGGLES && !AFK_TOGGLES.enabled('lzcache')) return;   // 🎚️ 外掛開關

    if (typeof LZString === 'undefined' || typeof LZString.decompressFromUTF16 !== 'function') {
        console.warn('[AFK-lzcache] 找不到 LZString.decompressFromUTF16，快取停用（遊戲照常運作）。');
        return;
    }
    if (LZString.decompressFromUTF16.__afkLz) return;   // 冪等：重複載入不疊包

    // 上限以「字元數」計而非筆數：一筆存檔可能幾十萬字元，用筆數當上限等於沒有上限。
    var MAX_CHARS = 3000000;   // 全部快取內容合計上限（≈ 6MB 記憶體）
    var MAX_ENTRY = 1200000;   // 單筆超過就不收（不讓一筆大檔把整個快取擠光）

    var cache = new Map();     // 壓縮字串 → 解壓字串（Map 保留插入序 → 拿它做 LRU）
    var chars = 0;
    var hits = 0, misses = 0;

    var orig = LZString.decompressFromUTF16.bind(LZString);
    LZString.decompressFromUTF16 = function (s) {
        if (typeof s !== 'string' || !s) return orig(s);
        if (cache.has(s)) {
            hits++;
            var v = cache.get(s);
            cache.delete(s); cache.set(s, v);   // 移到最新端（LRU）
            return v;
        }
        misses++;
        var out = orig(s);
        var size = (s.length + (typeof out === 'string' ? out.length : 0));
        if (size <= MAX_ENTRY) {
            while (chars + size > MAX_CHARS && cache.size) {
                var oldK = cache.keys().next().value, oldV = cache.get(oldK);
                chars -= oldK.length + (typeof oldV === 'string' ? oldV.length : 0);
                cache.delete(oldK);
            }
            cache.set(s, out);
            chars += size;
        }
        return out;
    };
    LZString.decompressFromUTF16.__afkLz = true;

    // ───────────────────────────────────────────────────────────────────────
    // 第二層：血盟 Buff 查詢快取（省掉重複的 JSON.parse + 正規化）
    //
    // getClanBuffStats(p) 的回傳只由三件事決定：血盟資料本身、這個角色的身分(clanRoleId)、
    // 他所在的模式(clanModeKey)。三者都沒變 → 答案一定一樣，卻要付「重讀 + JSON.parse 242KB
    // + _clanNormalizeState 整份正規化」約 1ms。它掛在 recomputeStats() 裡，逐殺重算的配裝
    // （吉爾塔斯魔杖）一小時離線要跑四萬次 → 45 秒以上都花在這。
    //
    // 快取鍵＝角色+模式，有效性靠「壓縮字串有沒有變」判定（跟第一層同一個道理：任何人寫過
    // 那個 key，字串就不同 → 自動失效，不需要通知機制）。讀那個字串本身很便宜（不解壓、不 parse）。
    //
    // ⚠ 兩個一定要守住的點：
    //   1. **滿 30 秒那次不可以走快取**——getClanBuffStats 裡藏著「順便結算血盟貢獻」的副作用
    //      （_clanSettleRole：扣貢獻、貢獻不足時關掉 Buff、寫回存檔）。那次一律走原函式。
    //   2. **每次都回傳新的複本**——原函式本來就每次回一個新物件，呼叫端若就地改它，
    //      共用同一個物件會把快取汙染掉。
    //   3. 快取要**每個角色一格**（Map）：一次結算會在玩家與各傭兵之間輪流問，
    //      單格快取的命中率是 0（實測過，一開始就是這樣寫錯的）。
    // ───────────────────────────────────────────────────────────────────────
    var cbHits = 0, cbMisses = 0;
    var cbCache = new Map();   // '角色id\n模式' → { raw:壓縮字串, val:結果 }
    if (typeof window.getClanBuffStats === 'function' && !window.getClanBuffStats.__afkClanBuf) {
        var cbOrig = window.getClanBuffStats;
        window.getClanBuffStats = function (p) {
            if (window.AFK_TOGGLES && !AFK_TOGGLES.enabled('lzcache')) return cbOrig(p);
            var id, mode, raw;
            try {
                if (!p) p = player;
                id = clanRoleId(p);
                // 這次會觸發 30 秒一輪的貢獻結算（有副作用）→ 一定要走原路
                if (!id || Date.now() - (Number(_clanLastSettleByRole[id]) || 0) >= 30000) return cbOrig(p);
                mode = clanModeKey(p);
                raw = (typeof _lsGet === 'function') ? _lsGet(CLAN_STATE_KEY) : localStorage.getItem(CLAN_STATE_KEY);
            } catch (e) { return cbOrig(p); }   // 少了任何一個核心全域就透明放行
            var k = id + '\n' + mode;
            var hit = cbCache.get(k);
            if (hit && hit.raw === raw) { cbHits++; return hit.val ? Object.assign({}, hit.val) : null; }
            cbMisses++;
            var val = cbOrig(p);
            if (cbCache.size > 200) cbCache.clear();   // 角色數本來就是幾十的量級；真的爆掉就整個丟掉重來
            cbCache.set(k, { raw: raw, val: val });
            return val ? Object.assign({}, val) : null;
        };
        window.getClanBuffStats.__afkClanBuf = true;
    }

    window.AFK_LZCACHE = {   // 供 afk-diag / 問題回報取證（唯讀）
        stats: function () {
            return {
                hits: hits, misses: misses, entries: cache.size, chars: chars,
                clanBuffHits: cbHits, clanBuffMisses: cbMisses, clanBuffEntries: cbCache.size
            };
        },
        clear: function () { cache.clear(); chars = 0; cbCache.clear(); }
    };

    if (window.AFK_TOGGLES) AFK_TOGGLES.register({
        id: 'lzcache',
        name: '存檔解壓快取',
        desc: '減少讀存檔與血盟資料的重複處理，戰鬥比較不卡、離線結算快好幾倍',
        group: '系統與其他',
        def: true
    });

    console.log('[AFK-lzcache] hooks OK');
})();
