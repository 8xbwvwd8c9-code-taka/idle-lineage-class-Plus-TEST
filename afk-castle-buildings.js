/**
 * afk-castle-buildings.js — 城堡建築系統
 *
 * 血盟佔領城堡後，盟主（Royal 王族）可建造與升級 15 種建築：
 *   🔨 武器工坊 (Weapon Workshop)    武器強化成功率 +0.5%~+2.5%
 *   🛡️ 防具工坊 (Armor Workshop)    盔甲強化成功率 +0.5%~+2.5%
 *   💍 飾品店 (Accessory Shop)       飾品強化成功率 +0.5%~+2.5%
 *   ⛓️ 監獄 (Prison)                EXP 獲得量 +1%~+5%
 *   🪙 金庫 (Gold Vault)            金幣獲得量 +1%~+5%
 *   💎 礦坑 (Mine)                  自動生產龍之鑽石
 *   ⚔️ 訓練場 (Training Grounds)    近距離傷害+2、近距離命中+2 per LV
 *   🏹 射擊場 (Shooting Range)      遠距離暴擊率+2%、遠距離暴擊傷害+2% per LV
 *   📚 圖書館 (Library)             魔法命中+1、額外魔法點數+1 per LV
 *   🧙 魔法塔 (Magic Tower)         魔法暴擊率+1%、魔法傷害+1 per LV
 *   🧪 魔法練習場 (Magic Practice)  MP恢復量+1點、魔法暴擊傷害+2% per LV
 *   🌲 農場 (Farm)                  HP恢復量+2點、藥水恢復量+1% per LV
 *   🐉 狩獵小屋 (Hunting Lodge)     遠距離傷害+2、遠距離命中+2 per LV
 *   🪖 練兵場 (Drill Ground)        移動速度+2%、迴避率+1% per LV
 *   ⛪ 神殿 (Temple)                魔法防禦力+2、各屬性防禦力+1 per LV
 *
 * 依賴：
 *   - afk-toggles.js（外掛開關中樞）
 *   - 核心補丁：scripts/apply-core-patches.mjs（資料結構、NPC、collection、EXP/Gold bonus）
 *
 * 架構約束：
 *   - 所有建築資料存於 st.castleBuildings（血盟根層級，由核心補丁在 _clanDefaultState / _clanNormalizeState 管理）
 *   - 建築效果僅在 siegeVictoryActive() === true 時生效
 *   - 僅 Royal 王族血盟盟主可進行建造/升級/加速/採收
 */

(function () {
    'use strict';

    // ── 外掛開關 ─────────────────────────────────────────────
    if (window.AFK_TOGGLES && !AFK_TOGGLES.enabled('castleBuildings')) return;
    if (window.AFK_TOGGLES) {
        AFK_TOGGLES.register({
            id: 'castleBuildings',
            name: '城堡建築系統',
            desc: '城鎮建築管理與升級：12 種城堡建築',
            group: '功能',
            def: true
        });
    }

    // ── 建築資料表 ───────────────────────────────────────────
    // 各建築 5 級的成本、時間、效果值
    var BUILDING_DATA = {
        // 🔨 武器工坊 — 武器強化成功率（百分比）
        weaponShop: {
            name: '武器工坊', emoji: '🔨',
            effectLabel: '武器強化機率',
            costs: [
                null,
                { scrollW: 100, blessW: 1, gold: 1000000, time: 3600000 },
                { scrollW: 200, blessW: 2, gold: 1000000, time: 21600000 },
                { scrollW: 300, blessW: 3, gold: 1000000, time: 43200000 },
                { scrollW: 400, blessW: 4, gold: 1000000, time: 64800000 },
                { scrollW: 500, blessW: 5, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 0.5, 1.0, 1.5, 2.0, 2.5]
        },
        // 🛡️ 防具工坊 — 盔甲強化成功率（百分比）
        armorShop: {
            name: '防具工坊', emoji: '🛡️',
            effectLabel: '盔甲強化機率',
            costs: [
                null,
                { scrollA: 100, blessA: 1, gold: 1000000, time: 3600000 },
                { scrollA: 200, blessA: 2, gold: 1000000, time: 21600000 },
                { scrollA: 300, blessA: 3, gold: 1000000, time: 43200000 },
                { scrollA: 400, blessA: 4, gold: 1000000, time: 64800000 },
                { scrollA: 500, blessA: 5, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 0.5, 1.0, 1.5, 2.0, 2.5]
        },
        // ⛓️ 監獄 — EXP 獲得量（百分比）
        prison: {
            name: '監獄', emoji: '⛓️',
            effectLabel: 'EXP 獲得量',
            costs: [
                null,
                { gold: 1000000, time: 3600000 },
                { gold: 2000000, time: 21600000 },
                { gold: 3000000, time: 43200000 },
                { gold: 4000000, time: 64800000 },
                { gold: 10000000, time: 86400000 }
            ],
            effects: [0, 1, 2, 3, 4, 5]
        },
        // 🪙 金庫 — 金幣獲得量（百分比）
        goldVault: {
            name: '金庫', emoji: '🪙',
            effectLabel: '金幣獲得量',
            costs: [
                null,
                { gold: 1000000, time: 3600000 },
                { gold: 2000000, time: 21600000 },
                { gold: 3000000, time: 43200000 },
                { gold: 4000000, time: 64800000 },
                { gold: 10000000, time: 86400000 }
            ],
            effects: [0, 1, 2, 3, 4, 5]
        },
        // 💎 礦坑 — 自動生產龍之鑽石
        treasure: {
            name: '礦坑', emoji: '💎',
            effectLabel: '每次產出',
            costs: [
                null,
                { dd: 1, gold: 1000000, time: 3600000 },
                { dd: 5, gold: 1000000, time: 21600000 },
                { dd: 12, gold: 1000000, time: 43200000 },
                { dd: 25, gold: 1000000, time: 64800000 },
                { dd: 50, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 1, 2, 4, 7, 10]
        },
        // ⚔️ 訓練場 — 近距離傷害+2、近距離命中+2（每級）
        trainingGrounds: {
            name: '訓練場', emoji: '⚔️',
            effectLabel: '近距離傷害/命中',
            costs: [
                null,
                { scrollW: 100, blessW: 1, gold: 1000000, time: 3600000 },
                { scrollW: 200, blessW: 2, gold: 1000000, time: 21600000 },
                { scrollW: 300, blessW: 3, gold: 1000000, time: 43200000 },
                { scrollW: 400, blessW: 4, gold: 1000000, time: 64800000 },
                { scrollW: 500, blessW: 5, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 2, 4, 6, 8, 10]  // atk/hit +值 per LV
        },
        // 🏹 射擊場 — 遠距離暴擊率+2%、遠距離暴擊傷害+2%（每級）
        shootingRange: {
            name: '射擊場', emoji: '🏹',
            effectLabel: '遠距離暴擊率/暴擊傷害',
            costs: [
                null,
                { scrollW: 100, blessW: 1, gold: 1000000, time: 3600000 },
                { scrollW: 200, blessW: 2, gold: 1000000, time: 21600000 },
                { scrollW: 300, blessW: 3, gold: 1000000, time: 43200000 },
                { scrollW: 400, blessW: 4, gold: 1000000, time: 64800000 },
                { scrollW: 500, blessW: 5, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 2, 4, 6, 8, 10]  // crit rate/dmg +% per LV
        },
        // 📚 圖書館 — 魔法命中+1、額外魔法點數+1（每級）
        library: {
            name: '圖書館', emoji: '📚',
            effectLabel: '魔法命中/額外魔法點數',
            costs: [
                null,
                { scrollA: 100, blessA: 1, gold: 1000000, time: 3600000 },
                { scrollA: 200, blessA: 2, gold: 1000000, time: 21600000 },
                { scrollA: 300, blessA: 3, gold: 1000000, time: 43200000 },
                { scrollA: 400, blessA: 4, gold: 1000000, time: 64800000 },
                { scrollA: 500, blessA: 5, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 1, 2, 3, 4, 5]  // magic hit/sp +值 per LV
        },
        // 🧙 魔法塔 — 魔法暴擊率+1%、魔法傷害+1（每級）
        magicTower: {
            name: '魔法塔', emoji: '🧙',
            effectLabel: '魔法暴擊率/魔法傷害',
            costs: [
                null,
                { magicStone: 100, bluePotion: 100, gold: 1000000, time: 3600000 },
                { magicStone: 200, bluePotion: 200, gold: 1000000, time: 21600000 },
                { magicStone: 300, bluePotion: 300, gold: 1000000, time: 43200000 },
                { magicStone: 400, bluePotion: 400, gold: 1000000, time: 64800000 },
                { magicStone: 500, bluePotion: 500, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 1, 2, 3, 4, 5]  // magic crit rate +% / magic dmg +值 per LV
        },
        // 🪄 魔法練習場 — MP恢復量+1點、魔法暴擊傷害+2%（每級）
        magicPractice: {
            name: '魔法練習場', emoji: '🪄',
            effectLabel: 'MP恢復量/魔法暴擊傷害',
            costs: [
                null,
                { magicStone: 100, bluePotion: 100, gold: 1000000, time: 3600000 },
                { magicStone: 200, bluePotion: 200, gold: 1000000, time: 21600000 },
                { magicStone: 300, bluePotion: 300, gold: 1000000, time: 43200000 },
                { magicStone: 400, bluePotion: 400, gold: 1000000, time: 64800000 },
                { magicStone: 500, bluePotion: 500, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 1, 2, 3, 4, 5]  // MP regen +值 / magic crit dmg +% per LV
        },
        // 🌲 農場 — HP恢復量+2點、藥水恢復量+1%（每級）
        farm: {
            name: '農場', emoji: '🌲',
            effectLabel: 'HP恢復量/藥水恢復量',
            costs: [
                null,
                { whitePotion: 100, gold: 1000000, time: 3600000 },
                { whitePotion: 200, gold: 1000000, time: 21600000 },
                { whitePotion: 300, gold: 1000000, time: 43200000 },
                { whitePotion: 400, gold: 1000000, time: 64800000 },
                { whitePotion: 500, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 2, 4, 6, 8, 10]  // HP regen +2點 per LV (potion heal +1% = half)
        },
        // 🐉 狩獵小屋 — 遠距離傷害+2、遠距離命中+2（每級）；封頂移動速度+10%、近距離命中+10
        huntingLodge: {
            name: '狩獵小屋', emoji: '🐉',
            effectLabel: '遠距離傷害/命中',
            costs: [
                null,
                { scrollW: 100, blessW: 1, gold: 1000000, time: 3600000 },
                { scrollW: 200, blessW: 2, gold: 1000000, time: 21600000 },
                { scrollW: 300, blessW: 3, gold: 1000000, time: 43200000 },
                { scrollW: 400, blessW: 4, gold: 1000000, time: 64800000 },
                { scrollW: 500, blessW: 5, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 2, 4, 6, 8, 10]  // ranged atk/hit +值 per LV
        },
        // 🪖 練兵場 — 移動速度+2%、迴避率+1%（每級）
        drillGround: {
            name: '練兵場', emoji: '🪖',
            effectLabel: '移動速度/迴避率',
            costs: [
                null,
                { crystal: 10, gold: 1000000, time: 3600000 },
                { crystal: 20, gold: 1000000, time: 21600000 },
                { crystal: 30, gold: 1000000, time: 43200000 },
                { crystal: 40, gold: 1000000, time: 64800000 },
                { crystal: 50, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 2, 4, 6, 8, 10]  // move speed +% / dodge +% per LV
        },
        // ⛪ 神殿 — 魔法防禦力+2、各屬性防禦力+1（每級）
        temple: {
            name: '神殿', emoji: '⛪',
            effectLabel: '魔法防禦力/屬性防禦',
            costs: [
                null,
                { crystal: 10, gold: 1000000, time: 3600000 },
                { crystal: 20, gold: 1000000, time: 21600000 },
                { crystal: 30, gold: 1000000, time: 43200000 },
                { crystal: 40, gold: 1000000, time: 64800000 },
                { crystal: 50, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 2, 4, 6, 8, 10]  // MR +值 per LV (elem def = half)
        },
        // 💍 飾品店 — 飾品強化成功率 +0.5%~+2.5%（每級）
        accessoryShop: {
            name: '飾品店', emoji: '💍',
            effectLabel: '飾品強化機率',
            costs: [
                null,
                { scrollAcc: 10, gold: 1000000, time: 3600000 },
                { scrollAcc: 20, gold: 1000000, time: 21600000 },
                { scrollAcc: 30, gold: 1000000, time: 43200000 },
                { scrollAcc: 40, gold: 1000000, time: 64800000 },
                { scrollAcc: 50, gold: 10000000, time: 86400000 }
            ],
            effects: [0, 0.5, 1.0, 1.5, 2.0, 2.5]  // enchant rate +% per LV
        }
    };

    // 建築 ID 列表（15 棟）
    var BUILDING_IDS = [
        'weaponShop', 'armorShop', 'accessoryShop', 'prison', 'goldVault', 'treasure',
        'trainingGrounds', 'shootingRange', 'library', 'magicTower', 'magicPractice',
        'farm', 'huntingLodge', 'drillGround', 'temple'
    ];

    // ── 工具函式 ─────────────────────────────────────────────

    /** 最近一次讀取的血盟根物件快取（供 _clanWriteState 寫回使用） */
    var _clanCache = null;

    /** 安全讀取血盟建築資料（自動初始化所有建築條目） */
    function getCastleBuildings() {
        try {
            if (typeof _clanReadState !== 'function') return null;
            var clan = _clanReadState();
            if (!clan) return null;
            _clanCache = clan;
            var all = clan.castleBuildings || null;
            if (all) {
                // 確保所有 BUILDING_IDS 都有條目（處理舊存檔只有 5 棟的情況）
                var now = Date.now();
                var changed = false;
                for (var bi = 0; bi < BUILDING_IDS.length; bi++) {
                    var bid = BUILDING_IDS[bi];
                    if (!all[bid]) {
                        all[bid] = { lv: 0, startAt: 0, finishAt: 0 };
                        // 礦坑額外初始化生產時間軸
                        if (bid === 'treasure') {
                            all[bid].lastTick = now;
                            all[bid].accumulated = 0;
                        }
                        changed = true;
                    }
                }
                if (changed) {
                    saveCastleBuildings();
                }
            }
            return all;
        } catch (e) {
            console.warn('[CastleBuildings] getCastleBuildings error:', e);
            return null;
        }
    }

    /** 將建築資料寫回血盟儲存 */
    function saveCastleBuildings() {
        if (typeof _clanWriteState === 'function' && _clanCache) {
            _clanWriteState(_clanCache);
        }
    }

    /** 取得單一建築資料（含預設值） */
    function getBuilding(id) {
        var all = getCastleBuildings();
        if (!all || !all[id]) return null;
        return all[id];
    }

    /** 取得建築等級（0-5，無城堡時回 0） */
    function getCastleBuildingLevel(id) {
        if (typeof siegeVictoryActive !== 'function' || !siegeVictoryActive()) return 0;
        var b = getBuilding(id);
        return b ? (b.lv || b.level || 0) : 0;
    }

    /** 取得建築效果百分比值 */
    function getCastleBuildingEffect(id) {
        var lv = getCastleBuildingLevel(id);
        var cfg = BUILDING_DATA[id];
        if (!cfg || !cfg.effects) return 0;
        return cfg.effects[lv] || 0;
    }

    /** 檢查玩家是否為 Royal 王族血盟盟主 */
    function isRoyalLeader() {
        try {
            if (typeof player === 'undefined' || !player) return false;
            if (player.cls !== 'royal') return false;
            if (typeof clanIsLeaderRole !== 'function') return false;
            return clanIsLeaderRole(player);
        } catch (e) {
            return false;
        }
    }

    /** 檢查是否擁有城堡 */
    function hasCastle() {
        return typeof siegeVictoryActive === 'function' && siegeVictoryActive();
    }

    /** 檢查建築是否正在施工 */
    function isConstructing(building) {
        return building && (building.finishAt || building.constructionEnd) > Date.now();
    }

    /** 檢查建築是否已達最高等級 */
    function isMaxLevel(id, building) {
        var cfg = BUILDING_DATA[id];
        var lv = building.lv || building.level || 0;
        return cfg && building && lv >= 5;
    }

    /** 消耗物品（從背包移除指定數量的道具） */
    function consumeItem(id, count) {
        if (!player || !Array.isArray(player.inv)) return false;
        var remaining = count;
        for (var i = player.inv.length - 1; i >= 0 && remaining > 0; i--) {
            var item = player.inv[i];
            if (item && item.id === id) {
                var qty = item.cnt || 1;
                if (qty <= remaining) {
                    player.inv.splice(i, 1);
                    remaining -= qty;
                } else {
                    item.cnt = qty - remaining;
                    remaining = 0;
                }
            }
        }
        return remaining <= 0;
    }

    /** 計算背包中某道具的數量 */
    function countItem(id) {
        if (!player || !Array.isArray(player.inv)) return 0;
        var total = 0;
        for (var i = 0; i < player.inv.length; i++) {
            var item = player.inv[i];
            if (item && item.id === id) total += (item.cnt || 1);
        }
        return total;
    }

    /** 取得龍之鑽石數量（優先使用潘朵拉共享龍鑽，fallback 到背包道具） */
    function getDiamondCount() {
        if (typeof window.pandoraGetSharedDiamonds === 'function') {
            return window.pandoraGetSharedDiamonds();
        }
        return countItem('dragon_diamond');
    }

    /** 消耗龍之鑽石（優先使用潘朵拉共享龍鑽，fallback 到背包道具） */
    function consumeDiamonds(count) {
        if (typeof window.pandoraAdjustSharedDiamonds === 'function') {
            var result = window.pandoraAdjustSharedDiamonds(-count);
            return result && result.ok;
        }
        return consumeItem('dragon_diamond', count);
    }

    /** 檢查建築收集冊是否已註冊某 key */
    function buildingDexHas(key) {
        try {
            if (!player) return false;
            if (!player.buildingDex) player.buildingDex = {};
            return !!player.buildingDex[key];
        } catch (e) { return false; }
    }

    /** 註冊建築收集冊 */
    function castleBuildingDexCheck(id, lv) {
        try {
            if (!player) return;
            if (!player.buildingDex) player.buildingDex = {};
            var key = id + '_lv' + lv;
            if (!player.buildingDex[key]) {
                player.buildingDex[key] = true;
                if (typeof saveGame === 'function') saveGame();
            }
        } catch (e) {
            console.warn('[CastleBuildings] dexCheck error:', e);
        }
    }

    /** 全收集獎勵檢查：12 棟建築皆 LV5 → 效果 +1% */
    function hasFullCollectionBonus() {
        if (!player || !player.buildingDex) return false;
        var allMax = true;
        for (var i = 0; i < BUILDING_IDS.length; i++) {
            var id = BUILDING_IDS[i];
            var key = id + '_lv5';
            if (!player.buildingDex[key]) { allMax = false; break; }
        }
        return allMax;
    }

    /** 取得建築最終效果（含全收集加成） */
    function getFinalEffect(id) {
        var base = getCastleBuildingEffect(id);
        if (base > 0 && hasFullCollectionBonus()) {
            base += 1;
        }
        return base;
    }

    // ── 核心功能 ─────────────────────────────────────────────

    /**
     * 開始建造/升級
     * @param {string} buildingId - 建築 ID
     * @returns {object} { success, message }
     */
    function castleStartBuilding(buildingId) {
        try {
            // 1. 驗證建築 ID
            var cfg = BUILDING_DATA[buildingId];
            if (!cfg) return { success: false, message: '無效的建築。' };

            // 2. 驗證城堡持有
            if (!hasCastle()) return { success: false, message: '您的血盟目前未佔領任何城堡。' };

            // 3. 驗證權限
            if (!isRoyalLeader()) return { success: false, message: '僅有 Royal 王族血盟盟主可管理城堡建築。' };

            // 4. 讀取建築狀態
            var all = getCastleBuildings();
            if (!all) return { success: false, message: '無法讀取血盟資料。' };
            var building = all[buildingId];
            if (!building) return { success: false, message: '建築資料不存在。' };

            // 5. 驗證不在施工中
            if (isConstructing(building)) {
                var end = building.finishAt || building.constructionEnd || 0;
                var remaining = Math.max(0, end - Date.now());
                var hours = Math.floor(remaining / 3600000);
                var mins = Math.floor((remaining % 3600000) / 60000);
                return { success: false, message: '此建築正在施工中，剩餘 ' + hours + ' 小時 ' + mins + ' 分。' };
            }

            // 6. 驗證未滿級
            if (isMaxLevel(buildingId, building)) return { success: false, message: '此建築已達最高等級。' };

            var curLv = building.lv || building.level || 0;
            var nextLv = curLv + 1;
            var cost = cfg.costs[nextLv];
            if (!cost) return { success: false, message: '無法取得升級成本資料。' };

            // 7. 驗證資源
            if (cost.scrollW && countItem('scroll_weapon') < cost.scrollW) return { success: false, message: '武器強化卷軸不足，需要 ' + cost.scrollW + ' 張。' };
            if (cost.blessW && countItem('scroll_weapon_b') < cost.blessW) return { success: false, message: '祝福的武器強化卷軸不足，需要 ' + cost.blessW + ' 張。' };
            if (cost.scrollA && countItem('scroll_armor') < cost.scrollA) return { success: false, message: '盔甲強化卷軸不足，需要 ' + cost.scrollA + ' 張。' };
            if (cost.blessA && countItem('scroll_armor_b') < cost.blessA) return { success: false, message: '祝福的盔甲強化卷軸不足，需要 ' + cost.blessA + ' 張。' };
            if (cost.gold && (player.gold || 0) < cost.gold) return { success: false, message: '金幣不足，需要 ' + cost.gold.toLocaleString() + ' 金幣。' };
            if (cost.dd) {
                var ddCount = getDiamondCount();
                if (ddCount < cost.dd) return { success: false, message: '龍之鑽石不足，需要 ' + cost.dd + ' 顆（持有 ' + ddCount + ' 顆）。' };
            }
            // 新建築資源類型
            if (cost.magicStone && countItem('new_item_150') < cost.magicStone) return { success: false, message: '魔法寶石不足，需要 ' + cost.magicStone + ' 顆。' };
            if (cost.bluePotion && countItem('potion_blue') < cost.bluePotion) return { success: false, message: '藍色藥水不足，需要 ' + cost.bluePotion + ' 瓶。' };
            if (cost.whitePotion && countItem('potion_ult') < cost.whitePotion) return { success: false, message: '白色藥水不足，需要 ' + cost.whitePotion + ' 瓶。' };
            if (cost.crystal && countItem('sherine_crystal') < cost.crystal) return { success: false, message: '席林結晶不足，需要 ' + cost.crystal + ' 個。' };
            if (cost.scrollAcc && countItem('scroll_acc') < cost.scrollAcc) return { success: false, message: '對飾品施法的卷軸不足，需要 ' + cost.scrollAcc + ' 張。' };

            // 8. 消耗資源
            if (cost.scrollW) consumeItem('scroll_weapon', cost.scrollW);
            if (cost.blessW) consumeItem('scroll_weapon_b', cost.blessW);
            if (cost.scrollA) consumeItem('scroll_armor', cost.scrollA);
            if (cost.blessA) consumeItem('scroll_armor_b', cost.blessA);
            if (cost.gold) player.gold = Math.max(0, (player.gold || 0) - cost.gold);
            if (cost.dd) consumeDiamonds(cost.dd);
            if (cost.magicStone) consumeItem('new_item_150', cost.magicStone);
            if (cost.bluePotion) consumeItem('potion_blue', cost.bluePotion);
            if (cost.whitePotion) consumeItem('potion_ult', cost.whitePotion);
            if (cost.crystal) consumeItem('sherine_crystal', cost.crystal);
            if (cost.scrollAcc) consumeItem('scroll_acc', cost.scrollAcc);

            // 9. 設定施工計時器
            building.startAt = Date.now();
            building.finishAt = Date.now() + cost.time;
            building.targetLevel = nextLv;
            building.constructionStart = Date.now();
            building.constructionEnd = Date.now() + cost.time;

            // 10. 存檔（血盟資料 + 玩家資料）
            saveCastleBuildings();
            if (typeof saveGame === 'function') saveGame();

            // 11. 更新 UI
            if (typeof renderCastleBuildingsPanel === 'function') renderCastleBuildingsPanel();

            // 消耗資源明細
            var costParts = [];
            if (cost.scrollW) costParts.push('武卷×' + cost.scrollW);
            if (cost.blessW) costParts.push('祝武×' + cost.blessW);
            if (cost.scrollA) costParts.push('防卷×' + cost.scrollA);
            if (cost.blessA) costParts.push('祝防×' + cost.blessA);
            if (cost.gold) costParts.push('金幣 ' + cost.gold.toLocaleString());
            if (cost.dd) costParts.push('龍鑽×' + cost.dd);
            if (cost.magicStone) costParts.push('魔法寶石×' + cost.magicStone);
            if (cost.bluePotion) costParts.push('藍水×' + cost.bluePotion);
            if (cost.whitePotion) costParts.push('白水×' + cost.whitePotion);
            if (cost.crystal) costParts.push('結晶×' + cost.crystal);
            if (cost.scrollAcc) costParts.push('飾品卷×' + cost.scrollAcc);
            var costStr = costParts.length > 0 ? '（消耗：' + costParts.join('、') + '）' : '';

            return { success: true, message: cfg.name + ' 升級至 Lv.' + nextLv + ' 已開始，預計 ' + formatTime(cost.time) + ' 後完成。' + costStr };
        } catch (e) {
            console.error('[CastleBuildings] startBuilding error:', e);
            return { success: false, message: '升級失敗：' + e.message };
        }
    }

    /**
     * 加速建造（消耗龍之鑽石）
     * @param {string} buildingId - 建築 ID
     * @param {number} count - 使用龍鑽數量（1 顆 = 減 1 小時）
     * @returns {object} { success, message }
     */
    function castleAccelerate(buildingId, count) {
        try {
            count = Math.max(1, Math.floor(count) || 1);

            if (!hasCastle()) return { success: false, message: '您的血盟目前未佔領任何城堡。' };
            if (!isRoyalLeader()) return { success: false, message: '僅有 Royal 王族血盟盟主可進行加速。' };

            var all = getCastleBuildings();
            if (!all || !all[buildingId]) return { success: false, message: '建築資料不存在。' };
            var building = all[buildingId];

            if (!isConstructing(building)) return { success: false, message: '此建築目前不在施工中。' };

            var ddCount = getDiamondCount();
            if (ddCount < count) return { success: false, message: '龍之鑽石不足，需要 ' + count + ' 顆（持有 ' + ddCount + ' 顆）。' };

            // 計算可減少的毫秒數（1 顆 = 1 小時）
            var reduceMs = count * 3600000;
            var end = building.finishAt || building.constructionEnd || 0;
            var remaining = end - Date.now();
            var actualReduce = Math.min(reduceMs, remaining);
            var actualCount = Math.ceil(actualReduce / 3600000);

            if (actualCount <= 0) return { success: false, message: '無需加速。' };

            // 消耗龍鑽
            consumeDiamonds(actualCount);
            var newEnd = end - actualReduce;
            building.finishAt = newEnd;
            building.constructionEnd = newEnd;

            // 存檔（血盟資料）
            saveCastleBuildings();

            // 如果完工時間已過，立即完成
            if (newEnd <= Date.now()) {
                castleCompleteBuilding(buildingId);
            } else {
                if (typeof saveGame === 'function') saveGame();
                if (typeof renderCastleBuildingsPanel === 'function') renderCastleBuildingsPanel();
            }

            return { success: true, message: '加速完成，消耗 ' + actualCount + ' 顆龍之鑽石。' };
        } catch (e) {
            console.error('[CastleBuildings] accelerate error:', e);
            return { success: false, message: '加速失敗：' + e.message };
        }
    }

    /**
     * 完成建造（升級）
     * @param {string} buildingId - 建築 ID
     * @returns {object} { success, message }
     */
    function castleCompleteBuilding(buildingId) {
        try {
            var all = getCastleBuildings();
            if (!all || !all[buildingId]) return { success: false, message: '建築資料不存在。' };
            var building = all[buildingId];

            var end = building.finishAt || building.constructionEnd || 0;
            if (!end || end > Date.now()) {
                return { success: false, message: '建築尚未完工。' };
            }

            var curLv = building.lv || building.level || 0;
            var targetLv = building.targetLevel || (curLv + 1);
            building.lv = targetLv;
            building.level = targetLv;
            building.startAt = 0;
            building.finishAt = 0;
            building.constructionStart = 0;
            building.constructionEnd = 0;
            building.targetLevel = null;

            // 註冊收集冊
            castleBuildingDexCheck(buildingId, building.lv);

            // 存檔（血盟資料 + 玩家資料）
            saveCastleBuildings();
            if (typeof saveGame === 'function') saveGame();
            if (typeof renderCastleBuildingsPanel === 'function') renderCastleBuildingsPanel();

            var cfg = BUILDING_DATA[buildingId];
            return { success: true, message: (cfg ? cfg.name : buildingId) + ' 已升級至 Lv.' + building.lv + '！' };
        } catch (e) {
            console.error('[CastleBuildings] completeBuilding error:', e);
            return { success: false, message: '完工處理失敗：' + e.message };
        }
    }

    /**
     * 檢查所有建築的施工狀態（由 tick 定時呼叫）
     */
    function castleCheckCompletion() {
        try {
            if (typeof siegeVictoryActive !== 'function' || !siegeVictoryActive()) return;
            var all = getCastleBuildings();
            if (!all) return;
            var changed = false;
            for (var i = 0; i < BUILDING_IDS.length; i++) {
                var id = BUILDING_IDS[i];
                var b = all[id];
                var end = b.finishAt || b.constructionEnd || 0;
                if (b && end > 0 && end <= Date.now()) {
                    var curLv = b.lv || b.level || 0;
                    var targetLv = b.targetLevel || (curLv + 1);
                    b.lv = targetLv;
                    b.level = targetLv;
                    b.startAt = 0;
                    b.finishAt = 0;
                    b.constructionStart = 0;
                    b.constructionEnd = 0;
                    b.targetLevel = null;
                    castleBuildingDexCheck(id, b.level);
                    changed = true;
                }
            }
            if (changed) {
                saveCastleBuildings();
                if (typeof saveGame === 'function') saveGame();
                if (typeof renderCastleBuildingsPanel === 'function') renderCastleBuildingsPanel();
            }
        } catch (e) {
            console.warn('[CastleBuildings] checkCompletion error:', e);
        }
    }

    // ── 礦坑生產系統 ───────────────────────────────────────

    /** 礦坑生產間隔：60 分鐘 */
    var TREASURE_INTERVAL = 3600000;
    /** 礦坑最大累積：24 次 */
    var TREASURE_MAX_ACCUM = 24;

    /**
     * 礦坑生產 tick — 每分鐘由 setInterval 呼叫
     * 根據礦坑等級計算龍之鑽石產量，累積到 accumulated
     */
    function castleTreasureTick() {
        try {
            if (typeof siegeVictoryActive !== 'function' || !siegeVictoryActive()) return;
            var all = getCastleBuildings();
            if (!all) return;
            var mine = all.treasure;
            if (!mine) return;
            var lv = mine.lv || mine.level || 0;
            if (lv <= 0) return;

            var now = Date.now();
            var lastTick = mine.lastTick || now;
            var elapsed = now - lastTick;
            if (elapsed < TREASURE_INTERVAL) return;

            // 計算經過了幾個生產週期
            var ticks = Math.floor(elapsed / TREASURE_INTERVAL);
            var produced = ticks * lv; // LV1=1顆/次, LV2=2顆/次...
            var maxAccum = TREASURE_MAX_ACCUM * lv;
            mine.accumulated = (mine.accumulated || 0) + produced;
            if (mine.accumulated > maxAccum) mine.accumulated = maxAccum;
            mine.lastTick = now - (elapsed % TREASURE_INTERVAL);

            saveCastleBuildings();
        } catch (e) {
            console.warn('[CastleBuildings] treasureTick error:', e);
        }
    }

    /**
     * 採收礦坑累積的龍之鑽石
     * @returns {object} { success, message, count }
     */
    function castleHarvestTreasure() {
        try {
            if (!hasCastle()) return { success: false, message: '您的血盟目前未佔領任何城堡。' };
            if (!isRoyalLeader()) return { success: false, message: '僅有 Royal 王族血盟盟主可採收礦坑。' };

            var all = getCastleBuildings();
            if (!all || !all.treasure) return { success: false, message: '礦坑資料不存在。' };
            var mine = all.treasure;
            var accumulated = mine.accumulated || 0;
            if (accumulated <= 0) return { success: false, message: '礦坑目前沒有累積的龍之鑽石。' };

            // 發放龍鑽到潘朵拉共享
            if (typeof window.pandoraAdjustSharedDiamonds === 'function') {
                var result = window.pandoraAdjustSharedDiamonds(accumulated);
                if (!result || !result.ok) {
                    return { success: false, message: '發放龍之鑽石失敗。' };
                }
            }

            mine.accumulated = 0;
            mine.lastTick = Date.now();
            saveCastleBuildings();
            if (typeof saveGame === 'function') saveGame();
            if (typeof renderCastleBuildingsPanel === 'function') renderCastleBuildingsPanel();

            return { success: true, message: '採收 ' + accumulated + ' 顆龍之鑽石！', count: accumulated };
        } catch (e) {
            console.error('[CastleBuildings] harvestTreasure error:', e);
            return { success: false, message: '採收失敗：' + e.message };
        }
    }

    // ── 效果鉤子（供遊戲核心或其他外掛呼叫）────────────────

    /** 取得武器強化機率加成（百分比） */
    window.getCastleEnchantBonus = function () {
        return getFinalEffect('weaponShop');
    };

    /** 取得盔甲強化機率加成（百分比） */
    window.getCastleArmorEnchantBonus = function () {
        return getFinalEffect('armorShop');
    };

    /** 取得飾品強化機率加成（百分比） */
    window.getCastleAccessoryEnchantBonus = function () {
        return getFinalEffect('accessoryShop');
    };

    /** 取得 EXP 獲得量加成（百分比） */
    window.getCastleExpBonus = function () {
        return getFinalEffect('prison');
    };

    /** 取得金幣獲得量加成（百分比） */
    window.getCastleGoldBonus = function () {
        return getFinalEffect('goldVault');
    };

    /** 取得近距離攻擊力/命中加成（數值） */
    window.getCastleMeleeBonus = function () {
        return getFinalEffect('trainingGrounds');
    };

    /** 取得遠距離暴擊率/暴擊傷害加成（百分比） */
    window.getCastleRangedCritBonus = function () {
        return getFinalEffect('shootingRange');
    };

    /** 取得魔法命中加成（數值，圖書館） */
    window.getCastleMagicHitBonus = function () {
        return getFinalEffect('library');
    };

    /** 取得 MP 恢復加成（百分比，魔法練習場） */
    window.getCastleMpRegenBonus = function () {
        return getFinalEffect('magicPractice');
    };

    /** 取得魔法暴擊率/魔法傷害加成（數值，魔法塔） */
    window.getCastleMagicCritBonus = function () {
        return getFinalEffect('magicTower');
    };

    /** 取得魔法傷害加成（數值，魔法塔） */
    window.getCastleMagicDmgBonus = function () {
        return getFinalEffect('magicTower');
    };

    /** 取得 HP 恢復速度加成（百分比，農場） */
    window.getCastleHpRegenBonus = function () {
        return getFinalEffect('farm');
    };

    /** 取得遠距離傷害/命中加成（數值，狩獵小屋） */
    window.getCastleRangedAtkBonus = function () {
        return getFinalEffect('huntingLodge');
    };

    /** 取得移動速度/迴避率加成（百分比，練兵場） */
    window.getCastleSpeedDodgeBonus = function () {
        return getFinalEffect('drillGround');
    };

    /** 取得神殿魔法防禦力/屬性防禦加成（數值） */
    window.getCastleTempleBonus = function () {
        return getFinalEffect('temple');
    };

    /** 取得魔法暴擊傷害加成（百分比，魔法練習場：+2% per LV） */
    window.getCastleMagicCritDmgBonus = function () {
        return getFinalEffect('magicPractice') * 2;
    };

    // ── UI 渲染 ─────────────────────────────────────────────

    /** 格式化時間（毫秒 → 可讀字串） */
    function formatTime(ms) {
        if (ms <= 0) return '已完成';
        var totalSec = Math.floor(ms / 1000);
        var days = Math.floor(totalSec / 86400);
        var hours = Math.floor((totalSec % 86400) / 3600);
        var mins = Math.floor((totalSec % 3600) / 60);
        var secs = totalSec % 60;
        var parts = [];
        if (days > 0) parts.push(days + '天');
        if (hours > 0) parts.push(hours + '小時');
        if (mins > 0) parts.push(mins + '分');
        if (secs > 0 || parts.length === 0) parts.push(secs + '秒');
        return parts.join('');
    }

    /** 格式化剩餘時間（用於倒數顯示） */
    function formatRemaining(endTime) {
        var remaining = endTime - Date.now();
        if (remaining <= 0) return '已完成';
        return formatTime(remaining);
    }

    /** 根據等級取得顏色 */
    function getLevelColor(lv) {
        var colors = ['#888', '#8f8', '#8ff', '#ff8', '#f88', '#f8f'];
        return colors[lv] || '#fff';
    }

    /** 根據等級取得邊框顏色 */
    function getLevelBorder(lv) {
        var borders = ['#555', '#282', '#288', '#882', '#822', '#828'];
        return borders[lv] || '#555';
    }

    /**
     * 渲染城堡建築面板
     * @param {HTMLElement} container - 要渲染到的容器元素
     */
    function renderCastleBuildingsPanel(container) {
        try {
            if (!container) {
                container = document.getElementById('castle-buildings-panel') || document.getElementById('interaction-content');
                if (!container) return;
            }

            var hasCastleFlag = hasCastle();
            var isLeader = isRoyalLeader();
            var all = getCastleBuildings();

            var html = '';
            html += '<div style="padding:10px;font-family:monospace;font-size:14px;color:#eee;max-height:500px;overflow-y:auto;">';

            // 狀態列
            html += '<div style="margin-bottom:10px;padding:8px;background:#333;border-radius:4px;font-size:13px;">';
            if (!hasCastleFlag) {
                html += '<span style="color:#f88;">⚠ 血盟目前未佔領任何城堡</span>';
            } else if (!isLeader) {
                html += '<span style="color:#ff8;">⚠ 僅 Royal 王族血盟盟主可管理建築</span>';
            } else {
                html += '<span style="color:#8f8;">✔ 可管理城堡建築</span>';
            }
            html += '</div>';

            if (!all) {
                html += '<div style="color:#f88;text-align:center;padding:20px;">無法讀取建築資料</div>';
                html += '</div>';
                container.innerHTML = html;
                return;
            }

            // 建築卡片網格
            html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">';

            for (var i = 0; i < BUILDING_IDS.length; i++) {
                var id = BUILDING_IDS[i];
                var cfg = BUILDING_DATA[id];
                if (!cfg) continue;
                var b = all[id] || { lv: 0, startAt: 0, finishAt: 0 };
                var lv = b.lv || b.level || 0;
                var isConstructingFlag = isConstructing(b);
                var isMax = isMaxLevel(id, b);
                var endTime = b.finishAt || b.constructionEnd || 0;
                var remaining = endTime > 0 ? Math.max(0, endTime - Date.now()) : 0;

                // 等級顏色
                var lvColor = getLevelColor(lv);
                var borderColor = getLevelBorder(lv);

                html += '<div style="border:1px solid ' + borderColor + ';border-radius:6px;padding:8px;background:rgba(0,0,0,0.4);position:relative;">';

                // 建築名稱與等級
                html += '<div style="font-size:15px;font-weight:bold;margin-bottom:4px;">';
                html += cfg.emoji + ' ' + cfg.name;
                html += ' <span style="color:' + lvColor + ';">Lv.' + lv + '/5</span>';
                if (isMax) html += ' <span style="color:#f8f;font-size:11px;">MAX</span>';
                html += '</div>';

                // 效果描述
                html += '<div style="font-size:12px;color:#aaa;margin-bottom:6px;">';
                if (id === 'treasure') {
                    // 礦坑特殊顯示
                    var mineLv = lv;
                    html += '每次產出：' + mineLv + ' 顆龍鑽';
                } else {
                    var effectVal = cfg.effects[lv] || 0;
                    switch (id) {
                        case 'trainingGrounds':
                            // 訓練場：近距離傷害+2、近距離命中+2（點數）
                            html += '近距離傷害+' + effectVal + ' / 命中+' + effectVal;
                            break;
                        case 'library':
                            // 圖書館：魔法命中+1、額外魔法點數+1（點數）
                            html += '魔法命中+' + effectVal + ' / 額外魔法點數+' + effectVal;
                            break;
                        case 'temple':
                            // 神殿：魔法防禦力+2、屬性防禦+1（點數）
                            html += '魔法防禦力+' + effectVal + ' / 屬性防禦+' + (effectVal / 2);
                            break;
                        case 'magicTower':
                            // 魔法塔：魔法暴擊率+1%、魔法傷害+1（點數）
                            html += '魔法暴擊率+' + effectVal + '% / 魔法傷害+' + effectVal;
                            break;
                        case 'magicPractice':
                            // 魔法練習場：MP恢復量+1點、魔法暴擊傷害+2%（百分比）
                            html += 'MP恢復量+' + effectVal + ' / 魔法暴擊傷害+' + (effectVal * 2) + '%';
                            break;
                        case 'farm':
                            // 農場：HP恢復量+2點、藥水恢復量+1%（每級）
                            html += 'HP恢復量+' + effectVal + ' / 藥水恢復量+' + (effectVal / 2) + '%';
                            break;
                        case 'huntingLodge':
                            // 狩獵小屋：遠距離傷害+2、遠距離命中+2（點數）
                            html += '遠距離傷害+' + effectVal + ' / 命中+' + effectVal;
                            break;
                        case 'drillGround':
                            // 練兵場：移動速度+2%、迴避率+1%（百分比+點數）
                            html += '移動速度+' + effectVal + '% / 迴避率+' + (effectVal / 2);
                            break;
                        case 'shootingRange':
                            // 射擊場：遠距離暴擊率+2%、暴擊傷害+2%（百分比）
                            html += '遠距離暴擊率+' + effectVal + '% / 暴擊傷害+' + effectVal + '%';
                            break;
                        default:
                            // 單一效果建築：武器工坊、防具工坊、飾品店、監獄、金庫（百分比）
                            html += cfg.effectLabel + '+' + effectVal + '%';
                            break;
                    }
                }
                html += '</div>';

                // ── 綠色進度條：施工時間進度 ──
                if (isConstructingFlag && remaining > 0) {
                    var cost = cfg.costs[lv + 1];
                    var totalTime = cost ? cost.time : 3600000;
                    var progress = Math.max(0, Math.min(100, ((totalTime - remaining) / totalTime) * 100));
                    html += '<div style="margin-bottom:4px;">';
                    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:#8f8;margin-bottom:1px;">';
                    html += '<span>施工進度</span><span class="castle-pct-' + id + '">' + progress.toFixed(1) + '%</span>';
                    html += '</div>';
                    html += '<div style="background:#444;border-radius:3px;height:8px;overflow:hidden;">';
                    html += '<div class="castle-pbar-' + id + '" style="background:#4caf50;height:100%;width:' + progress.toFixed(1) + '%;transition:width 1s;"></div>';
                    html += '</div>';
                    html += '<div class="castle-timer-' + id + '" style="font-size:11px;color:#8f8;margin-top:2px;">⏳ ' + formatRemaining(endTime) + '</div>';
                    html += '</div>';

                    // 加速按鈕
                    if (hasCastleFlag && isLeader) {
                        html += '<button class="castle-accel-btn" data-id="' + id + '" style="font-size:11px;padding:2px 6px;margin-right:4px;background:#555;color:#fff;border:1px solid #888;border-radius:3px;cursor:pointer;">⚡加速</button>';
                    }
                }

                // ── 藍色進度條：礦坑每小時生產倒數 ──
                if (id === 'treasure' && lv > 0) {
                    var lastTick = b.lastTick || 0;
                    var elapsed = lastTick > 0 ? Math.max(0, Date.now() - lastTick) : 0;
                    var minePct = Math.max(0, Math.min(100, (elapsed / TREASURE_INTERVAL) * 100));
                    var remainTime = Math.max(0, TREASURE_INTERVAL - elapsed);
                    html += '<div style="margin-bottom:4px;">';
                    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:#4af;margin-bottom:1px;">';
                    html += '<span>⚡ 下次生產</span><span class="castle-mine-timer">' + formatTime(remainTime) + '</span>';
                    html += '</div>';
                    html += '<div style="background:#444;border-radius:3px;height:8px;overflow:hidden;">';
                    html += '<div class="castle-mine-pbar" style="background:#2196f3;height:100%;width:' + minePct.toFixed(1) + '%;transition:width 1s;"></div>';
                    html += '</div>';
                    html += '</div>';

                    // 採收按鈕（顯示總累積；即使為 0 仍顯示按鈕，讓玩家知道位置）
                    var mineAccum = b.accumulated || 0;
                    if (hasCastleFlag && isLeader) {
                        html += '<button class="castle-harvest-btn" data-id="treasure" style="font-size:12px;padding:3px 10px;margin-top:2px;background:#a62;color:#fff;border:1px solid #c84;border-radius:4px;cursor:pointer;">';
                        html += '💎 採收（累積 ' + mineAccum + ' 顆）';
                        html += '</button>';
                    }
                }

                // 升級按鈕
                if (!isConstructingFlag && hasCastleFlag && isLeader && !isMax) {
                    var nextLv = lv + 1;
                    var cost = cfg.costs[nextLv];
                    if (cost) {
                        html += '<button class="castle-upgrade-btn" data-id="' + id + '" style="font-size:12px;padding:3px 10px;background:#2a6;color:#fff;border:1px solid #4a8;border-radius:4px;cursor:pointer;">';
                        html += '⬆ 升級 Lv.' + nextLv;
                        html += '</button>';
                        // 成本提示
                        html += '<div style="font-size:10px;color:#888;margin-top:2px;">';
                        var costParts = [];
                        if (cost.scrollW) costParts.push('武卷×' + cost.scrollW);
                        if (cost.blessW) costParts.push('祝武×' + cost.blessW);
                        if (cost.scrollA) costParts.push('防卷×' + cost.scrollA);
                        if (cost.blessA) costParts.push('祝防×' + cost.blessA);
                        if (cost.gold) costParts.push('金幣 ' + cost.gold.toLocaleString());
                        if (cost.dd) costParts.push('龍鑽×' + cost.dd);
                        if (cost.magicStone) costParts.push('魔法寶石×' + cost.magicStone);
                        if (cost.bluePotion) costParts.push('藍水×' + cost.bluePotion);
                        if (cost.whitePotion) costParts.push('白水×' + cost.whitePotion);
                        if (cost.crystal) costParts.push('結晶×' + cost.crystal);
                        if (cost.scrollAcc) costParts.push('飾品卷×' + cost.scrollAcc);
                        html += costParts.join(' ');
                        html += ' | 時間 ' + formatTime(cost.time);
                        html += '</div>';
                    }
                }

                html += '</div>';
            }

            html += '</div>'; // grid

            // 全收集獎勵提示
            if (hasFullCollectionBonus()) {
                html += '<div style="margin-top:10px;padding:6px;background:linear-gradient(90deg,#828,#448);border-radius:4px;text-align:center;font-size:13px;color:#ff8;">';
                html += '🏆 全收集獎勵：所有建築效果 +1%';
                html += '</div>';
            }

            html += '</div>'; // outer
            container.innerHTML = html;

            // 綁定按鈕事件
            var upgradeBtns = container.querySelectorAll('.castle-upgrade-btn');
            for (var ui = 0; ui < upgradeBtns.length; ui++) {
                (function (btn) {
                    btn.addEventListener('click', function () {
                        var bid = btn.getAttribute('data-id');
                        var result = castleStartBuilding(bid);
                        if (result && result.message) {
                            if (typeof showMessage === 'function') {
                                showMessage(result.message);
                            } else {
                                alert(result.message);
                            }
                        }
                    });
                })(upgradeBtns[ui]);
            }

            var accelBtns = container.querySelectorAll('.castle-accel-btn');
            for (var ai = 0; ai < accelBtns.length; ai++) {
                (function (btn) {
                    btn.addEventListener('click', function () {
                        var bid = btn.getAttribute('data-id');
                        var count = prompt('請輸入要使用的龍之鑽石數量（1 顆 = 減少 1 小時）：', '1');
                        if (count === null) return;
                        count = parseInt(count, 10);
                        if (isNaN(count) || count <= 0) {
                            if (typeof showMessage === 'function') {
                                showMessage('請輸入有效的正整數。');
                            } else {
                                alert('請輸入有效的正整數。');
                            }
                            return;
                        }
                        var result = castleAccelerate(bid, count);
                        if (result && result.message) {
                            if (typeof showMessage === 'function') {
                                showMessage(result.message);
                            } else {
                                alert(result.message);
                            }
                        }
                    });
                })(accelBtns[ai]);
            }

            var harvestBtns = container.querySelectorAll('.castle-harvest-btn');
            for (var hi = 0; hi < harvestBtns.length; hi++) {
                (function (btn) {
                    btn.addEventListener('click', function () {
                        var result = castleHarvestTreasure();
                        if (result && result.message) {
                            if (typeof showMessage === 'function') {
                                showMessage(result.message);
                            } else {
                                alert(result.message);
                            }
                        }
                    });
                })(harvestBtns[hi]);
            }
        } catch (e) {
            console.error('[CastleBuildings] render error:', e);
        }
    }

    /**
     * 渲染建築收集冊面板
     * @param {HTMLElement} container - 要渲染到的容器元素
     */
    function renderBuildingAlbum(container) {
        try {
            if (!container) {
                container = document.getElementById('castle-album-panel');
                if (!container) return;
            }

            var html = '';
            html += '<div style="padding:10px;font-family:monospace;font-size:14px;color:#eee;">';
            html += '<div style="font-size:16px;font-weight:bold;margin-bottom:10px;">📖 建築收集冊</div>';

            var totalCollected = 0;
            var totalPossible = BUILDING_IDS.length * 5; // 12 棟 × 5 級

            html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">';

            for (var i = 0; i < BUILDING_IDS.length; i++) {
                var id = BUILDING_IDS[i];
                var cfg = BUILDING_DATA[id];
                if (!cfg) continue;

                html += '<div style="border:1px solid #555;border-radius:4px;padding:6px;background:rgba(0,0,0,0.3);">';
                html += '<div style="font-size:13px;font-weight:bold;margin-bottom:4px;">' + cfg.emoji + ' ' + cfg.name + '</div>';

                for (var lv = 1; lv <= 5; lv++) {
                    var key = id + '_lv' + lv;
                    var collected = buildingDexHas(key);
                    if (collected) totalCollected++;
                    html += '<span style="display:inline-block;width:28px;height:20px;line-height:20px;text-align:center;font-size:11px;margin:1px;border-radius:3px;';
                    if (collected) {
                        html += 'background:#2a6;color:#fff;">Lv' + lv;
                    } else {
                        html += 'background:#333;color:#666;">?';
                    }
                    html += '</span>';
                }

                html += '</div>';
            }

            html += '</div>';

            // 進度
            var pct = totalPossible > 0 ? ((totalCollected / totalPossible) * 100).toFixed(1) : 0;
            html += '<div style="margin-top:10px;text-align:center;font-size:13px;color:#aaa;">';
            html += '收集進度：' + totalCollected + ' / ' + totalPossible + '（' + pct + '%）';
            html += '</div>';

            // 全收集獎勵
            if (hasFullCollectionBonus()) {
                html += '<div style="margin-top:8px;padding:6px;background:linear-gradient(90deg,#828,#448);border-radius:4px;text-align:center;font-size:13px;color:#ff8;">';
                html += '🏆 全收集獎勵已啟用：所有建築效果 +1%';
                html += '</div>';
            }

            html += '</div>';
            container.innerHTML = html;
        } catch (e) {
            console.error('[CastleBuildings] renderAlbum error:', e);
        }
    }

    // ── 全域鉤子（供 HTML onclick 或遊戲內呼叫）─────────────

    /**
     * 渲染管家 NPC 對話（由核心補丁 interactNPC 呼叫）
     * @param {HTMLElement} contentDiv - #interaction-content 元素
     */
    window.renderCastleButler = function (contentDiv) {
        if (!contentDiv) {
            contentDiv = document.getElementById('interaction-content');
            if (!contentDiv) return;
        }
        // 直接在 NPC 對話內容區渲染建築面板
        renderCastleBuildingsPanel(contentDiv);
    };

    /** 升級按鈕（由 HTML onclick 呼叫） */
    window._castleUpgrade = function (buildingId) {
        var result = castleStartBuilding(buildingId);
        if (result && result.message) {
            if (typeof showMessage === 'function') showMessage(result.message);
        }
    };

    /** 加速按鈕（由 HTML onclick 呼叫） */
    window._castleAccel = function (buildingId) {
        var count = prompt('請輸入要使用的龍之鑽石數量（1 顆 = 減少 1 小時）：', '1');
        if (count === null) return;
        count = parseInt(count, 10);
        if (isNaN(count) || count <= 0) {
            if (typeof showMessage === 'function') showMessage('請輸入有效的正整數。');
            return;
        }
        var result = castleAccelerate(buildingId, count);
        if (result && result.message) {
            if (typeof showMessage === 'function') showMessage(result.message);
        }
    };

    /** 採收按鈕（由 HTML onclick 呼叫） */
    window._castleHarvest = function () {
        var result = castleHarvestTreasure();
        if (result && result.message) {
            if (typeof showMessage === 'function') showMessage(result.message);
        }
    };

    // ── 效果整合：Monkey-patch getClanBuffStats ──────────────
    //
    // 將城堡建築加成注入血盟 Buff 系統，以血盟成員為單位生效。
    // 原始 getClanBuffStats(p) 已檢查：
    //   - 玩家是否為血盟成員（st.members[id]）
    //   - 該成員是否在正確模式（member.mode === mode）
    //   - 血盟 Buff 是否開啟（member.buffOn）
    //   - 貢獻是否足夠（member.contribution >= CLAN_BUFF_HOUR_COST）
    //
    // 城堡建築效果為「持有城堡期間被動加成」，不應受個人 Buff 開關影響，
    // 因此我們在原始回傳值之上疊加城堡建築加成。
    //
    // 可透過 getClanBuffStats 回傳物件注入的建築效果：
    //   trainingGrounds → extraDmg, extraHit（近距離傷害+2、近距離命中+2 per LV）
    //   library         → extraMp（額外魔法點數+1 per LV；魔法命中透過 js/02 補丁）
    //   magicTower      → magicDmg（魔法傷害+1 per LV；魔法暴擊率透過 js/02 補丁）
    //   farm            → hpR（HP恢復量+2點 per LV；藥水恢復量透過 player._miscPotionBonus）
    //   huntingLodge    → extraDmg, extraHit（遠距離傷害+2、遠距離命中+2 per LV）
    //   magicPractice   → mpR（MP恢復量+1點 per LV；魔法暴擊傷害透過 js/02 補丁）
    //   temple          → mr（魔法防禦力+2 per LV；屬性防禦力透過 js/02 補丁）
    //
    // 需獨立整合的效果（不屬於 getClanBuffStats 回傳欄位）：
    //   shootingRange   → 遠距離暴擊率/暴擊傷害（js/02 recomputeStats，核心補丁 13）
    //   drillGround     → 移動速度/迴避率（js/02 recomputeStats，核心補丁 13）
    //   weaponShop      → 武器強化成功率（enhanceRollOutcome，js/01，核心補丁 14）
    //   armorShop       → 盔甲強化成功率（enhanceRollOutcome，js/01，核心補丁 14）
    //   accessoryShop   → 飾品強化成功率（enhanceRollOutcome，js/01，核心補丁 14）
    //   以上五項已透過核心補丁 13、14 整合。
    (function () {
        if (typeof getClanBuffStats !== 'function') return;
        var _origGetClanBuffStats = getClanBuffStats;
        getClanBuffStats = function (p) {
            var result = _origGetClanBuffStats(p);
            // 原始函式回傳 null 表示玩家不滿足血盟 Buff 條件（非成員/Buff 關閉/貢獻不足）
            // 但城堡建築加成應獨立於個人 Buff 開關——只要玩家是血盟成員且血盟持有城堡就生效。
            // 然而我們無法在此區分「非成員」與「成員但關閉 Buff」——原始函式對兩者都回傳 null。
            // 因此我們改為：若原始回傳非 null（成員+Buff開啟），疊加城堡加成；
            // 若原始回傳 null，則只檢查是否為血盟成員，若是則仍給予城堡加成（不給血盟 Buff 本身）。
            var st = typeof _clanReadState === 'function' ? _clanReadState() : null;
            if (!st) return result;
            p = p || (typeof player !== 'undefined' ? player : null);
            if (!p) return result;
            var id = typeof clanRoleId === 'function' ? clanRoleId(p) : null;
            if (!id || !st.members || !st.members[id]) return result;
            // 玩家是血盟成員 → 檢查城堡持有狀態
            if (typeof siegeVictoryActive !== 'function' || !siegeVictoryActive()) return result;
            // 取得城堡建築資料
            var all = getCastleBuildings();
            if (!all) return result;
            // 若原始回傳 null（個人 Buff 關閉），建立空物件來疊加城堡加成
            if (!result) result = {};
            // ── 訓練場：近距離傷害+2、近距離命中+2 per LV ──
            var tgLv = all.trainingGrounds ? (all.trainingGrounds.lv || all.trainingGrounds.level || 0) : 0;
            if (tgLv > 0) {
                var tgVal = getFinalEffect('trainingGrounds');
                result.extraDmg = (result.extraDmg || 0) + tgVal;
                result.extraHit = (result.extraHit || 0) + tgVal;
            }
            // ── 狩獵小屋：遠距離傷害+2、遠距離命中+2 per LV ──
            var hlLv = all.huntingLodge ? (all.huntingLodge.lv || all.huntingLodge.level || 0) : 0;
            if (hlLv > 0) {
                var hlVal = getFinalEffect('huntingLodge');
                result.extraDmg = (result.extraDmg || 0) + hlVal;
                result.extraHit = (result.extraHit || 0) + hlVal;
            }
            // ── 圖書館：魔法命中+1、額外魔法點數+1 per LV ──
            var libLv = all.library ? (all.library.lv || all.library.level || 0) : 0;
            if (libLv > 0) {
                var libVal = getFinalEffect('library');
                result.extraMp = (result.extraMp || 0) + libVal;
                // 魔法命中透過 js/02-stats-recompute.js 補丁套用（d.magicHit）
            }
            // ── 魔法塔：魔法暴擊率+1%、魔法傷害+1 per LV ──
            var mtLv = all.magicTower ? (all.magicTower.lv || all.magicTower.level || 0) : 0;
            if (mtLv > 0) {
                var mtVal = getFinalEffect('magicTower');
                result.magicDmg = (result.magicDmg || 0) + mtVal;
                // 魔法暴擊率透過 js/02-stats-recompute.js 補丁套用（d.magicCrit）
            }
            // ── 魔法練習場：MP恢復量+1點、魔法暴擊傷害+2% per LV ──
            var mpLv = all.magicPractice ? (all.magicPractice.lv || all.magicPractice.level || 0) : 0;
            if (mpLv > 0) {
                var mpVal = getFinalEffect('magicPractice');
                result.mpR = (result.mpR || 0) + mpVal;           // MP恢復量+1點 per LV（固定值）
                // 魔法暴擊傷害透過 js/02-stats-recompute.js 補丁套用（d.magicCritDmg）
            }
            // ── 農場：HP恢復量+2點、藥水恢復量+1% per LV ──
            var farmLv = all.farm ? (all.farm.lv || all.farm.level || 0) : 0;
            if (farmLv > 0) {
                var farmVal = getFinalEffect('farm');
                result.hpR = (result.hpR || 0) + farmVal;         // HP恢復量+2點 per LV（固定值）
                // 藥水恢復量：直接寫入 player._miscPotionBonus（js/08-items-equip.js line 618 讀取）
                if (typeof p === 'object' && p !== null) {
                    p._miscPotionBonus = (p._miscPotionBonus || 0) + farmVal / 2;  // 藥水恢復量+1% per LV
                }
            }
            // ── 神殿：魔法防禦力+2、屬性防禦力+1 per LV ──
            var templeLv = all.temple ? (all.temple.lv || all.temple.level || 0) : 0;
            if (templeLv > 0) {
                result.mr = (result.mr || 0) + getFinalEffect('temple');
            }
            return result;
        };
        console.log('[CastleBuildings] getClanBuffStats 已掛載城堡建築加成。');
    })();

    // ── 初始化 ───────────────────────────────────────────────

    /**
     * 確保三個城堡的管家 NPC 存在（防瀏覽器快取舊版核心檔）
     *
     * 問題：核心補丁修改了 js/00-data.js（新增 npc_butler 定義）與
     * js/11-world-map.js（新增 NPC 站位、對話分派），但 index.html 的
     * ?v= 版本字串未更新，導致瀏覽器可能提供無管家 NPC 的舊版快取。
     * 此函式在執行時期補上缺失的資料，讓玩家不需 CTRL+F5 即可看到管家。
     */
    function ensureCastleButlerNPC() {
        try {
            if (typeof DB === 'undefined' || !DB || !DB.towns) return;

            var CASTLE_TOWNS = ['town_kent_castle', 'town_windwood_castle', 'town_heine_castle'];
            var BUTLER_SPOTS = {
                town_kent_castle: [58, 48],
                town_windwood_castle: [50, 52],
                town_heine_castle: [58, 48]
            };

            CASTLE_TOWNS.forEach(function (townId) {
                var town = DB.towns[townId];
                if (!town || !Array.isArray(town.npcs)) return;

                // 1. 確保 npc_butler 存在於 NPC 清單（管家應為最後一個 NPC）
                var butlerIdx = -1;
                for (var i = 0; i < town.npcs.length; i++) {
                    if (town.npcs[i] && town.npcs[i].id === 'npc_butler') {
                        butlerIdx = i;
                        break;
                    }
                }
                if (butlerIdx === -1) {
                    town.npcs.push({
                        id: 'npc_butler',
                        n: '管家',
                        title: '建築管理',
                        d: '你好，我是城堡的管家。我可以協助你管理城堡的建築物。'
                    });
                    butlerIdx = town.npcs.length - 1;
                    console.log('[CastleBuildings] 已注入 npc_butler 至 ' + townId);
                }

                // 2. 確保 TOWN_NPC_SPOTS 有管家站位（陣列長度不足時補足）
                if (typeof TOWN_NPC_SPOTS !== 'undefined' && TOWN_NPC_SPOTS[townId]) {
                    var spots = TOWN_NPC_SPOTS[townId];
                    var spot = BUTLER_SPOTS[townId];
                    if (spot) {
                        // 確保 spots 陣列夠長
                        while (spots.length <= butlerIdx) {
                            spots.push([50, 50]);  // 預設中間位置
                        }
                        spots[butlerIdx] = spot;
                        console.log('[CastleBuildings] 已更新 ' + townId + ' 管家站位 idx=' + butlerIdx);
                    }
                }
            });
        } catch (e) {
            console.warn('[CastleBuildings] ensureCastleButlerNPC error:', e);
        }
    }

    /**
     * 確保 interactNPC 能分派管家對話（防快取舊版 js/11-world-map.js）
     * 若 window.renderCastleButler 存在但 interactNPC 未處理 npc_butler，
     * 則包裹原函式：遇到管家時直接由我們處理，其餘委託原始邏輯。
     */
    function patchInteractNPCForButler() {
        try {
            if (typeof interactNPC !== 'function') return;
            if (typeof window.renderCastleButler !== 'function') return;

            // 測試目前 interactNPC 是否能處理 npc_butler
            var src = interactNPC.toString();
            if (src.indexOf('npc_butler') !== -1) {
                return;  // 已有處理邏輯，不需修補
            }

            var _origInteract = interactNPC;
            window._origInteractNPC = _origInteract;
            window.interactNPC = function (npcId, townId) {
                // 管家由我們直接處理（原始函式無此分支，會掉入「系統建置中」）
                try {
                    var town = DB.towns[townId];
                    if (town) {
                        var npc = town.npcs.find(function (n) { return n.id === npcId; });
                        if (npc && npc.id === 'npc_butler') {
                            document.getElementById('town-interaction-container').classList.remove('hidden');
                            document.getElementById('town-interaction-container').classList.add('flex');
                            document.getElementById('interaction-npc-name').innerText = npc.n;
                            document.getElementById('interaction-npc-title').innerText = '[' + (npc.title || '建築管理') + ']';
                            var contentDiv = document.getElementById('interaction-content');
                            if (contentDiv) {
                                contentDiv.innerHTML = '';
                                window.renderCastleButler(contentDiv);
                            }
                            return;
                        }
                    }
                } catch (e) {
                    console.warn('[CastleBuildings] patchInteractNPC butler error:', e);
                }
                // 非管家：委託原始邏輯
                _origInteract(npcId, townId);
            };
            console.log('[CastleBuildings] 已修補 interactNPC 以支援管家對話');
        } catch (e) {
            console.warn('[CastleBuildings] patchInteractNPC error:', e);
        }
    }

    function initCastleBuildings() {
        try {
            // 確保管家 NPC 資料存在（防快取）
            ensureCastleButlerNPC();
            patchInteractNPCForButler();

            // 確保血盟資料中有 castleBuildings
            if (typeof _clanReadState === 'function') {
                var clan = _clanReadState();
                if (clan && !clan.castleBuildings) {
                    clan.castleBuildings = {};
                    if (typeof _clanWriteState === 'function') {
                        _clanWriteState(clan);
                    }
                }
            }

            // 定時檢查施工完成（每秒）
            setInterval(function () {
                castleCheckCompletion();
                castleTreasureTick();

                // 倒數計時更新：只更新倒數文字與進度條，不重建整個 DOM（避免滾動位置重置）
                updateCountdowns();
            }, 1000);

            console.log('[CastleBuildings] 初始化完成，12 棟建築已就緒。');
        } catch (e) {
            console.warn('[CastleBuildings] init error:', e);
        }
    }

    /**
     * 更新所有可見面板中的倒數計時與進度條
     * 只操作已存在的 DOM 元素，不重建整個面板（避免滾動位置重置）
     */
    function updateCountdowns() {
        try {
            var containers = [];
            var panel = document.getElementById('castle-buildings-panel');
            if (panel && panel.offsetParent !== null) containers.push(panel);
            var npcPanel = document.getElementById('interaction-content');
            if (npcPanel && npcPanel.offsetParent !== null && npcPanel.querySelector('.castle-upgrade-btn')) {
                containers.push(npcPanel);
            }
            if (containers.length === 0) return;

            var now = Date.now();
            var all = getCastleBuildings();
            if (!all) return;

            for (var ci = 0; ci < containers.length; ci++) {
                var c = containers[ci];
                // 更新施工倒數（每個建築卡片）
                for (var i = 0; i < BUILDING_IDS.length; i++) {
                    var id = BUILDING_IDS[i];
                    var b = all[id];
                    if (!b) continue;
                    var endTime = b.finishAt || b.constructionEnd || 0;
                    var remaining = endTime > 0 ? Math.max(0, endTime - now) : 0;

                    // 施工進度條與倒數文字
                    var timerEl = c.querySelector('.castle-timer-' + id);
                    if (timerEl) {
                        timerEl.textContent = '⏳ ' + formatRemaining(endTime);
                    }
                    var pbarEl = c.querySelector('.castle-pbar-' + id);
                    if (pbarEl && remaining > 0) {
                        var cfg = BUILDING_DATA[id];
                        var lv = b.lv || b.level || 0;
                        var cost = cfg ? cfg.costs[lv + 1] : null;
                        var totalTime = cost ? cost.time : 3600000;
                        var progress = Math.max(0, Math.min(100, ((totalTime - remaining) / totalTime) * 100));
                        pbarEl.style.width = progress.toFixed(1) + '%';
                        // 更新百分比文字
                        var pctEl = c.querySelector('.castle-pct-' + id);
                        if (pctEl) pctEl.textContent = progress.toFixed(1) + '%';
                    }

                    // 礦坑生產倒數
                    if (id === 'treasure') {
                        var lastTick = b.lastTick || 0;
                        var elapsed = lastTick > 0 ? Math.max(0, now - lastTick) : 0;
                        var remainTime = Math.max(0, TREASURE_INTERVAL - elapsed);
                        var mineTimerEl = c.querySelector('.castle-mine-timer');
                        if (mineTimerEl) {
                            mineTimerEl.textContent = formatTime(remainTime);
                        }
                        var minePctEl = c.querySelector('.castle-mine-pbar');
                        if (minePctEl) {
                            var minePct = Math.max(0, Math.min(100, (elapsed / TREASURE_INTERVAL) * 100));
                            minePctEl.style.width = minePct.toFixed(1) + '%';
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[CastleBuildings] updateCountdowns error:', e);
        }
    }

    // 啟動初始化（DOM 就緒後）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCastleBuildings);
    } else {
        initCastleBuildings();
    }

})();
