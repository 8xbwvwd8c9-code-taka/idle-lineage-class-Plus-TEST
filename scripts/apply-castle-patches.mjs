/**
 * apply-castle-patches.mjs — 城堡系統（Castle Buildings）核心補丁，集中於此一支。
 *
 * 設計原則（與 apply-core-patches.mjs 一致）：
 *   - 冪等：已補過就跳過（可重複跑）。
 *   - 錨點式：靠「函式/註解特徵字串」定位，不寫死行號 → 上游小改版大多仍插得進去。
 *   - 失敗大聲：錨點找不到就 throw（exit 1）→ CI 紅，讓人知道要修錨點。
 *
 * 本檔只負責「城堡系統」相關的核心鉤子；其餘核心補丁仍在 apply-core-patches.mjs。
 * 執行方式：由 apply-core-patches.mjs 匯入 castlePatches 並展開進 PATCHES 統一註冊；
 * 也可獨立執行 `node scripts/apply-castle-patches.mjs`（--check 只驗證、不寫檔）。
 *
 * 城堡補丁清單：
 *   9.  castleBuildingsData  — js/25 _clanDefaultState / _clanNormalizeState 加入 castleBuildings 資料結構
 *   10. castleButlerNPC      — js/11 三座城堡各加一個 Butler NPC 位置與對話分派
 *   11. castleBuildingCollection — js/18 道具收集冊加入第 6 類別「建築」
 *   12. castleExpGoldBonus   — js/05 EXP/Gold 計算加入城堡建築加成鉤子
 *   13. castleButlerNpcList  — js/00-data 三個城堡的 NPC 清單加入 npc_butler（管家）
 *   13. castleBuildingStats  — js/02 recomputeStats 加入射擊場/圖書館/魔法塔/魔法練習場/練兵場/神殿效果
 *   14. castleEnchantRate    — js/01 enhanceRollOutcome 加入武器/防具/飾品工坊強化成功率加成
 *   15. clanBuffExtraMp      — js/02 getClanBuffStats 套用區塊補上 extraMp
 */
import { readFileSync, writeFileSync } from 'node:fs';

const CHECK = process.argv.includes('--check');
let changed = 0, already = 0;

// ── 補丁 9：js/25 血盟資料結構加入 castleBuildings ─────────────────
//   在 _clanDefaultState 加入 castleBuildings:{}，並在 _clanNormalizeState 正規化城堡建築資料。
//   建築資料由外掛 afk-castle-buildings.js 使用。
function patchCastleBuildingsData() {
  const FILE = 'js/25-clan-system.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('castleBuildings')) { already++; return; }

  // 補丁 A：_clanDefaultState 加入 castleBuildings:{}
  const A1 = 'castleBuildings:{},';
  const A1_ANCHOR = "npcWorlds:{ normal:null, classic:null },";
  if (s.indexOf(A1_ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 _clanDefaultState 的 npcWorlds 錨點。`);
  s = s.replace(A1_ANCHOR, A1_ANCHOR + '\n        ' + A1 + '   // 🔌 加掛版補丁：城堡建築資料（血盟層級·外掛 afk-castle-buildings 使用）');

  // 補丁 B：_clanNormalizeState 正規化 castleBuildings
  const A2_ANCHOR = "out.npcWorlds.normal = _npcClanNormalizeWorld(raw.npcWorlds && raw.npcWorlds.normal);";
  if (s.indexOf(A2_ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 _clanNormalizeState 的 npcWorlds 正規化錨點。`);
  const A2_REPLACE = A2_ANCHOR + '\n' +
    '    // 🔌 加掛版補丁：正規化城堡建築資料\n' +
    '    if (raw.castleBuildings && typeof raw.castleBuildings === "object" && !Array.isArray(raw.castleBuildings)) {\n' +
    '        out.castleBuildings = {};\n' +
    '        var _validBld = ["weaponShop","armorShop","accessoryShop","prison","goldVault","treasure","trainingGrounds","shootingRange","library","magicTower","farm","huntingLodge","temple"];\n' +
    '        Object.keys(raw.castleBuildings).forEach(function (k) {\n' +
    '            if (_validBld.indexOf(k) < 0) return;\n' +
    '            var b = raw.castleBuildings[k];\n' +
    '            if (!b || typeof b !== "object") return;\n' +
    '            out.castleBuildings[k] = {\n' +
    '                lv: Math.max(0, Math.min(5, Math.floor(Number(b.lv) || 0))),\n' +
    '                startAt: Math.max(0, Math.floor(Number(b.startAt) || 0)),\n' +
    '                finishAt: Math.max(0, Math.floor(Number(b.finishAt) || 0)),\n' +
    '                lastTick: Math.max(0, Math.floor(Number(b.lastTick) || 0)),\n' +
    '                lastHarvestTime: Math.max(0, Math.floor(Number(b.lastHarvestTime) || 0)),\n' +
    '                accumulated: Math.max(0, Math.floor(Number(b.accumulated) || 0)),\n' +
    '                targetLevel: b.targetLevel ? Math.max(0, Math.min(5, Math.floor(Number(b.targetLevel) || 0))) : null\n' +
    '            };\n' +
    '        });\n' +
    '    }';

  s = s.replace(A2_ANCHOR, A2_REPLACE);

  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] castleBuildings 資料結構（${FILE}）`);
}

// ── 補丁 10：js/11 城堡城鎮加入 Butler NPC（npc_butler）────────────────
//   在三座城堡的 TOWN_NPC_SPOTS 各加一個 Butler 位置，並在 NPC 對話分派加入 npc_butler 分支。
function patchCastleButlerNPC() {
  const FILE = 'js/11-world-map.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('npc_butler')) { already++; return; }

  // 補丁 A：在 TOWN_NPC_SPOTS 三座城堡各加一個 Butler 位置
  //   肯特城堡：在現有 10 點之外加第 11 點（大廳右側）
  const A1_FROM = "town_kent_castle: [[42, 37], [65, 36], [43, 52], [66, 54], [48, 67], [61, 61], [50, 35], [50, 35], [54, 47], [72, 64]],";
  const A1_TO   = "town_kent_castle: [[42, 37], [65, 36], [43, 52], [66, 54], [48, 67], [61, 61], [50, 35], [50, 35], [54, 47], [72, 64], [58, 48]],   // 🔌 加掛版補丁:第 11 點 Butler 管家的位置";
  if (s.indexOf(A1_FROM) < 0) throw new Error(`[${FILE}] 找不到 town_kent_castle 錨點。`);
  s = s.replace(A1_FROM, A1_TO);

  //   風木城堡：在現有 7 點之外加第 8 點
  const A2_FROM = "town_windwood_castle: [[37, 43], [61, 43], [40, 57], [48, 35], [48, 35], [60, 59], [48, 72]],";
  const A2_TO   = "town_windwood_castle: [[37, 43], [61, 43], [40, 57], [48, 35], [48, 35], [60, 59], [48, 72], [50, 52]],   // 🔌 加掛版補丁:第 8 點 Butler 管家的位置";
  if (s.indexOf(A2_FROM) < 0) throw new Error(`[${FILE}] 找不到 town_windwood_castle 錨點。`);
  s = s.replace(A2_FROM, A2_TO);

  //   海音城堡：在現有 8 點之外加第 9 點
  const A3_FROM = "town_heine_castle: [[52, 84], [76, 62], [68, 72], [66, 34], [42, 22], [42, 22], [27, 48], [66, 54]]";
  const A3_TO   = "town_heine_castle: [[52, 84], [76, 62], [68, 72], [66, 34], [42, 22], [42, 22], [27, 48], [66, 54], [58, 48]]   // 🔌 加掛版補丁:第 9 點 Butler 管家的位置";
  if (s.indexOf(A3_FROM) < 0) throw new Error(`[${FILE}] 找不到 town_heine_castle 錨點。`);
  s = s.replace(A3_FROM, A3_TO);

  // 補丁 B：在 NPC 對話分派加入 npc_butler 分支（在 npc_heine_guard 之後、npc.type==='ally' 之前）
  const A4_ANCHOR = "} else if (npc.type === 'ally') {";
  if (s.indexOf(A4_ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 ally NPC 分派錨點。`);
  const A4_INSERT =
    "    } else if (npc.id === 'npc_butler') {\n" +
    "        renderCastleButler(contentDiv);   // 🔌 加掛版補丁：城堡管家（建築管理·外掛 afk-castle-buildings 提供 renderCastleButler）\n";
  s = s.replace(A4_ANCHOR, A4_INSERT + '    ' + A4_ANCHOR);

  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] Butler NPC 管家（${FILE}）`);
}

// ── 補丁 11：js/18 道具收集冊加入第 6 類別「建築」────────────────────
//   在 MISC_CATEGORIES 加入 { key:'building', name:'建築' }，並在 miscCatKey 加入建築道具分類邏輯。
//   建築收集冊的 UI 由外掛 afk-castle-buildings.js 的 renderBuildingAlbum() 提供。
function patchCastleBuildingCollection() {
  const FILE = 'js/18-misc-book.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes("key:'building'") || s.includes("'building'")) { already++; return; }

  // 補丁 A：MISC_CATEGORIES 加入第 6 類別
  // 注意：上游檔案使用 CRLF (\r\n) 結尾，錨點字串必須比對實際換行格式
  const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const A1_FROM = "const MISC_CATEGORIES = [" + NL +
    "    { key: 'pot',     name: '藥水' }," + NL +
    "    { key: 'scroll',  name: '卷軸' }," + NL +
    "    { key: 'skillbk', name: '技能書' }," + NL +
    "    { key: 'mat',     name: '材料' }," + NL +
    "    { key: 'special', name: '其他' }" + NL +
    "];";
  const A1_TO = "const MISC_CATEGORIES = [" + NL +
    "    { key: 'pot',     name: '藥水' }," + NL +
    "    { key: 'scroll',  name: '卷軸' }," + NL +
    "    { key: 'skillbk', name: '技能書' }," + NL +
    "    { key: 'mat',     name: '材料' }," + NL +
    "    { key: 'special', name: '其他' }," + NL +
    "    { key: 'building',name: '建築' }    // 🔌 加掛版補丁：城堡建築收集（外掛 afk-castle-buildings 提供 UI）" + NL +
    "];";
  if (s.indexOf(A1_FROM) < 0) throw new Error(`[${FILE}] 找不到 MISC_CATEGORIES 定義。`);
  s = s.replace(A1_FROM, A1_TO);

  // 補丁 B：miscCatKey 加入建築道具分類（建築道具 id 前綴 building_）
  const A2_ANCHOR = "if (t === 'wpn' || t === 'arm' || t === 'acc') return null;          // 裝備 → 裝備收集冊";
  if (s.indexOf(A2_ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 miscCatKey 裝備排除錨點。`);
  const A2_INSERT = "    if (id.indexOf('building_') === 0) return 'building';   // 🔌 加掛版補丁：建築道具 → 建築收集冊" + NL + "    ";
  s = s.replace(A2_ANCHOR, A2_INSERT + A2_ANCHOR);

  // 補丁 C：MISC_CAT_BONUS 加入建築類別加成
  const A3_ANCHOR = "const MISC_CAT_BONUS = {";
  if (s.indexOf(A3_ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 MISC_CAT_BONUS 定義。`);
  const A3_INSERT = "    building: { stat: 'weight', val: 5, label: '負重 +5' },   // 🔌 加掛版補丁：建築全收集→負重+5" + NL;
  s = s.replace(A3_ANCHOR, A3_ANCHOR + NL + A3_INSERT);

  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] 建築收集類別（${FILE}）`);
}

// ── 補丁 12：js/05 EXP/Gold 計算加入城堡建築加成鉤子 ─────────────────
//   在 EXP 計算行與 Gold 計算行分別乘上城堡建築加成係數。
//   加成由外掛 afk-castle-buildings.js 的 window.getCastleExpBonus() / window.getCastleGoldBonus() 提供。
function patchCastleExpGoldBonus() {
  const FILE = 'js/05-kill-progression.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('getCastleExpBonus')) { already++; return; }

  // 補丁 A：EXP 計算加入城堡加成
  //   原式：let _playerExpGain = Math.floor(_petExpGain * getExpGainMult(player.lv) * (window.CUSTOM_CONFIG?.RATES?.EXP ?? 1)
  //   改為：... * (1 + (typeof window.getCastleExpBonus === 'function' ? window.getCastleExpBonus() : 0) / 100) ...
  const A1_FROM = "let _playerExpGain = Math.floor(_petExpGain * getExpGainMult(player.lv) * (window.CUSTOM_CONFIG?.RATES?.EXP ?? 1)";
  const A1_TO   = "let _playerExpGain = Math.floor(_petExpGain * getExpGainMult(player.lv) * (1 + (typeof window.getCastleExpBonus === 'function' ? window.getCastleExpBonus() : 0) / 100) * (window.CUSTOM_CONFIG?.RATES?.EXP ?? 1)   // 🔌 加掛版補丁:城堡建築 EXP 加成(外掛 afk-castle-buildings;未載/未佔領→0%)";
  if (s.indexOf(A1_FROM) < 0) throw new Error(`[${FILE}] 找不到 EXP 計算錨點。`);
  s = s.replace(A1_FROM, A1_TO);

  // 補丁 B：Gold 計算加入城堡加成
  //   原式：g = Math.floor( g * (1 + dollFieldVal('goldBonus') / 100) * partyRewardMult() * (window.CUSTOM_CONFIG?.RATES?.GOLD ?? 1) );
  //   改為：... * (1 + (typeof window.getCastleGoldBonus === 'function' ? window.getCastleGoldBonus() : 0) / 100) ...
  const A2_FROM = "g = Math.floor( g * (1 + dollFieldVal('goldBonus') / 100) * partyRewardMult() * (window.CUSTOM_CONFIG?.RATES?.GOLD ?? 1) );   // 🪆 娃娃加成後再乘有效隊伍人數（最高 ×8）";
  const A2_TO   = "g = Math.floor( g * (1 + dollFieldVal('goldBonus') / 100) * (1 + (typeof window.getCastleGoldBonus === 'function' ? window.getCastleGoldBonus() : 0) / 100) * partyRewardMult() * (window.CUSTOM_CONFIG?.RATES?.GOLD ?? 1) );   // 🔌 加掛版補丁:城堡建築金幣加成(外掛 afk-castle-buildings;未載/未佔領→0%) 🪆 娃娃加成後再乘有效隊伍人數（最高 ×8）";
  if (s.indexOf(A2_FROM) < 0) throw new Error(`[${FILE}] 找不到 Gold 計算錨點。`);
  s = s.replace(A2_FROM, A2_TO);

  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] 城堡建築 EXP/Gold 加成（${FILE}）`);
}

// ── 補丁 13：js/00-data 三個城堡的 NPC 清單加入 npc_butler（管家）────────────
//   補丁 10 只在 js/11-world-map.js 加了 Butler 位置與對話分派，但 NPC 定義在 js/00-data.js 的
//   DB.towns 裡——如果 NPC 不在 towns 的 npcs 陣列中，遊戲不會顯示該 NPC。
//   此補丁在三個城堡（肯特城、風木城、海音城）的 NPC 清單各加入 npc_butler。
function patchCastleButlerNpcList() {
  const FILE = 'js/00-data.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes("npc_butler")) { already++; return; }

  const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

  // 肯特城：在 npc_obel 之後插入 npc_butler
  const A1_FROM = '{ id: "npc_obel", n: "奧貝勒", title: "魔物追蹤", type: "exchange", d: "奧貝勒是追蹤魔物的老手，花費金幣追蹤指定地區的特定魔物。" }' + NL + '            ]';
  const A1_TO   = '{ id: "npc_obel", n: "奧貝勒", title: "魔物追蹤", type: "exchange", d: "奧貝勒是追蹤魔物的老手，花費金幣追蹤指定地區的特定魔物。" },' + NL +
    '                { id: "npc_butler", n: "管家", title: "城堡管家", type: "butler", d: "管家負責管理城堡建築設施，Royal 王族盟主可在此建造與升級建築。" }   // 🔌 加掛版補丁：城堡建築管家（外掛 afk-castle-buildings 提供 UI）' + NL +
    '            ]';
  if (s.indexOf(A1_FROM) < 0) throw new Error(`[${FILE}] 找不到 town_kent_castle 最後 NPC 錨點（npc_obel）。`);
  s = s.replace(A1_FROM, A1_TO);

  // 風木城：在 npc_hert 之後插入 npc_butler
  const A2_FROM = '{ id: "npc_hert", n: "赫特", title: "魔物追蹤", type: "exchange", d: "赫特循著魔物的氣息而行，花費金幣追蹤指定地區的特定魔物。" }' + NL + '            ]';
  const A2_TO   = '{ id: "npc_hert", n: "赫特", title: "魔物追蹤", type: "exchange", d: "赫特循著魔物的氣息而行，花費金幣追蹤指定地區的特定魔物。" },' + NL +
    '                { id: "npc_butler", n: "管家", title: "城堡管家", type: "butler", d: "管家負責管理城堡建築設施，Royal 王族盟主可在此建造與升級建築。" }   // 🔌 加掛版補丁：城堡建築管家（外掛 afk-castle-buildings 提供 UI）' + NL +
    '            ]';
  if (s.indexOf(A2_FROM) < 0) throw new Error(`[${FILE}] 找不到 town_windwood_castle 最後 NPC 錨點（npc_hert）。`);
  s = s.replace(A2_FROM, A2_TO);

  // 海音城：在 npc_diren 之後插入 npc_butler
  const A3_FROM = '{ id: "npc_diren", n: "帝倫", title: "魔物追蹤", type: "exchange", d: "帝倫熟知各地魔物的蹤跡，花費金幣追蹤指定地區的特定魔物。" }' + NL + '            ]';
  const A3_TO   = '{ id: "npc_diren", n: "帝倫", title: "魔物追蹤", type: "exchange", d: "帝倫熟知各地魔物的蹤跡，花費金幣追蹤指定地區的特定魔物。" },' + NL +
    '                { id: "npc_butler", n: "管家", title: "城堡管家", type: "butler", d: "管家負責管理城堡建築設施，Royal 王族盟主可在此建造與升級建築。" }   // 🔌 加掛版補丁：城堡建築管家（外掛 afk-castle-buildings 提供 UI）' + NL +
    '            ]';
  if (s.indexOf(A3_FROM) < 0) throw new Error(`[${FILE}] 找不到 town_heine_castle 最後 NPC 錨點（npc_diren）。`);
  s = s.replace(A3_FROM, A3_TO);

  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] 城堡 NPC 清單加入 npc_butler（${FILE}）`);
}

// ── 補丁 13：js/02 recomputeStats 加入射擊場/圖書館/魔法塔/魔法練習場/練兵場/神殿等建築效果 ──
//   在血盟 Buff 區塊之後插入城堡建築效果：
//     - shootingRange → d.rangedCrit, d.rangedCritDmg（遠距離暴擊率+2%、暴擊傷害+2% per LV）
//     - library       → d.magicHit（魔法命中+1 per LV；額外魔法點數已由 getClanBuffStats 處理）
//     - magicTower    → d.magicCrit（魔法暴擊率+1% per LV；魔法傷害已由 getClanBuffStats 處理）
//     - magicPractice → d.magicCritDmg（魔法暴擊傷害+2% per LV；MP恢復已由 getClanBuffStats 處理）
//     - drillGround   → d.moveSpeedPct, d.er（移動速度+2%、迴避率+1% per LV）
//     - temple        → d.resFire/Water/Earth/Wind（各屬性防禦力+1 per LV，MR 已由 getClanBuffStats 處理）
//   注意：huntingLodge（遠距離傷害/命中）和 trainingGrounds（近距離傷害/命中）已透過
//   getClanBuffStats 的 result.extraDmg/extraHit 標準欄位注入，不在本補丁重複處理。
//   加成由外掛 afk-castle-buildings.js 的 window.getCastleRangedCritBonus() /
//   window.getCastleMagicHitBonus() / window.getCastleMagicCritBonus() / window.getCastleMagicCritDmgBonus() /
//   window.getCastleSpeedDodgeBonus() / window.getCastleTempleBonus() 提供。
function patchCastleBuildingStats() {
const FILE = 'js/02-stats-recompute.js';
let s = readFileSync(FILE, 'utf8');
// 冪等檢查：用 v4 版特徵字串（「不在此重複」為 v4 獨有，v3 無此字樣）區分新舊
if (s.includes('不在此重複')) { already++; return; }

const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

// 先移除舊版補丁區塊（v1/v2/v3），避免重複
const OLD_V3 = '    // 🔌 加掛版補丁：城堡建築效果（射擊場／狩獵小屋／圖書館／魔法塔／魔法練習場／練兵場／神殿；外掛 afk-castle-buildings）';
const OLD_V2 = '    // 🔌 加掛版補丁：城堡建築效果（射擊場／狩獵小屋／圖書館／神殿；外掛 afk-castle-buildings）';
const OLD_V1 = '    // 🔌 加掛版補丁：城堡建築效果（射擊場／狩獵小屋；外掛 afk-castle-buildings）';
let oldIdx = s.indexOf(OLD_V3);
if (oldIdx < 0) oldIdx = s.indexOf(OLD_V2);
if (oldIdx < 0) oldIdx = s.indexOf(OLD_V1);
if (oldIdx >= 0) {
  // 找到舊區塊結尾：下一個註解或區塊開頭
  const afterOld = s.indexOf('    // 🐉 龍騎士 覺醒', oldIdx);
  if (afterOld > oldIdx) {
    s = s.slice(0, oldIdx) + s.slice(afterOld);
  }
}

// 錨點：血盟 Buff 區塊結尾的註解「// 🐉 龍騎士 覺醒」
const ANCHOR = NL + '    // 🐉 龍騎士 覺醒（安塔瑞斯/法利昂/巴拉卡斯）：d:{} 內的 AC/抗性/屬性/額外命中已由上方 buff 迴圈套用；此處補非標準效果與攻速';
if (s.indexOf(ANCHOR) < 0) throw new Error(`[${FILE}] 找不到龍騎士覺醒錨點——上游可能改寫了 recomputeStats 的區塊順序。`);

const INSERT =
  NL + '    // 🔌 加掛版補丁：城堡建築效果（射擊場／圖書館／魔法塔／魔法練習場／練兵場／神殿；外掛 afk-castle-buildings）' +
  NL + '    // 注意：huntingLodge（遠距離傷害/命中）和 trainingGrounds（近距離傷害/命中）' +
  NL + '    // 已透過 getClanBuffStats 的 extraDmg/extraHit 標準欄位注入，不在此重複。' +
  NL + '    if (typeof siegeVictoryActive === \'function\' && siegeVictoryActive()) {' +
  NL + '        if (typeof window.getCastleRangedCritBonus === \'function\') {' +
  NL + '            let _srVal = window.getCastleRangedCritBonus();' +
  NL + '            if (_srVal > 0) { d.rangedCrit += _srVal; d.rangedCritDmg += _srVal; }' +
  NL + '        }' +
  NL + '        // 圖書館：魔法命中+1 per LV（額外魔法點數已由 getClanBuffStats 處理）' +
  NL + '        if (typeof window.getCastleMagicHitBonus === \'function\') {' +
  NL + '            let _libVal = window.getCastleMagicHitBonus();' +
  NL + '            if (_libVal > 0) d.magicHit += _libVal;' +
  NL + '        }' +
  NL + '        // 魔法塔：魔法暴擊率+1% per LV（魔法傷害已由 getClanBuffStats 處理）' +
  NL + '        if (typeof window.getCastleMagicCritBonus === \'function\') {' +
  NL + '            let _mtVal = window.getCastleMagicCritBonus();' +
  NL + '            if (_mtVal > 0) d.magicCrit += _mtVal;' +
  NL + '        }' +
  NL + '        // 魔法練習場：魔法暴擊傷害+2% per LV（MP恢復已由 getClanBuffStats 處理）' +
  NL + '        if (typeof window.getCastleMagicCritDmgBonus === \'function\') {' +
  NL + '            let _mpVal = window.getCastleMagicCritDmgBonus();' +
  NL + '            if (_mpVal > 0) d.magicCritDmg += _mpVal;' +
  NL + '        }' +
  NL + '        // 練兵場：移動速度+2%、迴避率+1% per LV' +
  NL + '        if (typeof window.getCastleSpeedDodgeBonus === \'function\') {' +
  NL + '            let _dgVal = window.getCastleSpeedDodgeBonus();' +
  NL + '            if (_dgVal > 0) { d.moveSpeedPct += _dgVal; d.er += _dgVal / 2; }' +
  NL + '        }' +
  NL + '        // 神殿：各屬性防禦力+1 per LV（效果值一半，MR 已由 getClanBuffStats 處理）' +
  NL + '        if (typeof window.getCastleTempleBonus === \'function\') {' +
  NL + '            let _templeElem = window.getCastleTempleBonus() / 2;' +
  NL + '            if (_templeElem > 0) { d.resFire += _templeElem; d.resWater += _templeElem; d.resEarth += _templeElem; d.resWind += _templeElem; }' +
  NL + '        }' +
  NL + '    }';

s = s.replace(ANCHOR, INSERT + ANCHOR);

if (!CHECK) writeFileSync(FILE, s);
changed++;
console.log(`[patch] 城堡建築射擊場／圖書館／魔法塔／魔法練習場／練兵場／神殿效果（${FILE}）`);
}

// ── 補丁 14：js/01 enhanceRollOutcome 加入武器/防具/飾品工坊強化成功率加成 ──
//   在 enhanceRollOutcome 函式中，將亂數門檻乘上城堡建築加成係數。
//     - weaponShop    → 武器強化成功率+0.5% per LV（乘數 = 1 + getCastleEnchantBonus()/100）
//     - armorShop     → 防具強化成功率+0.5% per LV（乘數 = 1 + getCastleArmorEnchantBonus()/100）
//     - accessoryShop → 飾品強化成功率+0.5% per LV（乘數 = 1 + getCastleAccessoryEnchantBonus()/100）
//   加成由外掛 afk-castle-buildings.js 的 window.getCastleEnchantBonus() / getCastleArmorEnchantBonus() / getCastleAccessoryEnchantBonus() 提供。
function patchCastleEnchantRate() {
const FILE = 'js/01-drops-config.js';
let s = readFileSync(FILE, 'utf8');
if (s.includes('getCastleAccessoryEnchantBonus')) { already++; return; }

const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

// 錨點：enhanceRollOutcome 函式 return 行
const ANCHOR = '    return enhanceOutcomeFromRoll(d && d.type, safe, en, r);';
if (s.indexOf(ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 enhanceRollOutcome 的 return 行——上游可能改寫了衝裝函式。`);

const REPLACE =
  '    // 🔌 加掛版補丁：城堡建築強化成功率加成（武器工坊／防具工坊／飾品店；外掛 afk-castle-buildings）' + NL +
  '    if (typeof siegeVictoryActive === \'function\' && siegeVictoryActive()) {' + NL +
  '        if (d && d.type === \'wpn\' && typeof window.getCastleEnchantBonus === \'function\') {' + NL +
  '            let _wpnMult = 1 + window.getCastleEnchantBonus() / 100;' + NL +
  '            if (_wpnMult > 1) r = r / _wpnMult;' + NL +
  '        }' + NL +
  '        if (d && d.type === \'arm\' && typeof window.getCastleArmorEnchantBonus === \'function\') {' + NL +
  '            let _armMult = 1 + window.getCastleArmorEnchantBonus() / 100;' + NL +
  '            if (_armMult > 1) r = r / _armMult;' + NL +
  '        }' + NL +
  '        if (d && d.type === \'acc\' && typeof window.getCastleAccessoryEnchantBonus === \'function\') {' + NL +
  '            let _accMult = 1 + window.getCastleAccessoryEnchantBonus() / 100;' + NL +
  '            if (_accMult > 1) r = r / _accMult;' + NL +
  '        }' + NL +
  '    }' + NL +
  '    return enhanceOutcomeFromRoll(d && d.type, safe, en, r);';

s = s.replace(ANCHOR, REPLACE);

if (!CHECK) writeFileSync(FILE, s);
changed++;
console.log(`[patch] 城堡建築強化成功率加成（${FILE}）`);
}

// ── 補丁 15：js/02 getClanBuffStats 套用區塊補上 extraMp ──
//   遊戲原始碼的標準套用區塊（d.extraDmg / d.extraHit / d.mr / d.magicDmg / d.hpR / d.mpR / d.ac）
//   遺漏了 d.extraMp，導致圖書館的「額外魔法點數」雖然在 getClanBuffStats 中有設定，
//   但從未被實際套用到 player.d.extraMp。
function patchClanBuffExtraMp() {
const FILE = 'js/02-stats-recompute.js';
let s = readFileSync(FILE, 'utf8');
// 冪等檢查：d.extraMp += _cb.extraMp 已存在
if (s.includes("d.extraMp += _cb.extraMp")) { already++; return; }

const NL = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';

// 錨點：d.ac += _cb.ac || 0; 的下一行
const ANCHOR = '            d.ac += _cb.ac || 0;';
if (s.indexOf(ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 d.ac += _cb.ac 錨點。`);

const REPLACE = ANCHOR + NL + '            d.extraMp += _cb.extraMp || 0;';

s = s.replace(ANCHOR, REPLACE);

if (!CHECK) writeFileSync(FILE, s);
changed++;
console.log(`[patch] getClanBuffStats 補上 extraMp 套用（${FILE}）`);
}

// ── 匯出：城堡補丁清單（供 apply-core-patches.mjs 展開進 PATCHES 統一註冊）──
export const CASTLE_PATCH_VERSION = '1.0.0';

export const CASTLE_PATCH_INFO = {
  version: CASTLE_PATCH_VERSION,
  patches: 8,
  updated: '2026-08-01'
};

export const castlePatches = [
  patchCastleBuildingsData,
  patchCastleButlerNPC,
  patchCastleBuildingCollection,
  patchCastleExpGoldBonus,
  patchCastleButlerNpcList,
  patchCastleBuildingStats,
  patchCastleEnchantRate,
  patchClanBuffExtraMp
];

// 與 castlePatches 一一對應的補丁名稱（供 --check / 除錯輸出用）
export const castlePatchNames = [
  'patchCastleBuildingsData',
  'patchCastleButlerNPC',
  'patchCastleBuildingCollection',
  'patchCastleExpGoldBonus',
  'patchCastleButlerNpcList',
  'patchCastleBuildingStats',
  'patchCastleEnchantRate',
  'patchClanBuffExtraMp'
];

// ── 獨立執行（node scripts/apply-castle-patches.mjs）──
//   由 apply-core-patches.mjs 匯入時，此區塊不會執行（import 不會觸發頂層執行）。
//   僅在直接以 node 執行本檔時，才跑一遍城堡補丁。
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  try {
    for (const p of castlePatches) p();
  } catch (e) {
    console.error('❌ apply-castle-patches 失敗：' + e.message);
    process.exit(1);
  }

  if (CHECK) {
    if (changed > 0) { console.error(`❌ --check：有 ${changed} 個城堡補丁尚未套用（請跑 node scripts/apply-castle-patches.mjs）`); process.exit(1); }
    console.log(`✅ --check：全部 ${already} 個城堡補丁均已就位（v${CASTLE_PATCH_VERSION}）。`);
    for (const name of castlePatchNames) console.log(`   ✓ ${name}`);
  } else {
    console.log(`✅ apply-castle-patches 完成：新套用 ${changed}、已存在 ${already}（v${CASTLE_PATCH_VERSION}）。`);
  }
}