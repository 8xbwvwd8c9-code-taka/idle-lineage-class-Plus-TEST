/**
 * apply-core-patches.mjs — 在「拉進上游原版核心」之後，自動把加掛版必要的核心鉤子補回去。
 *
 * 設計原則（給自動更新流程用，取代舊的整檔合併）：
 *   - 冪等：已補過就跳過（可重複跑）。
 *   - 錨點式：靠「函式/註解特徵字串」定位，不寫死行號 → 上游小改版大多仍插得進去。
 *   - 失敗大聲：錨點找不到就 throw（exit 1）→ CI 紅，讓人知道要修錨點，而不是默默讓離線壞掉。
 *
 * 目前的核心補丁（越少越好）：
 *   1. maybeSpawnMobs — 把 js/03 tick() 內「出怪排程」那一塊 { } 抽成具名函式，讓離線快速結算
 *      能用「與線上同一份」的出怪排程（出怪延遲/BOSS 節流/後排格/席琳日光加速全照原作）。
 *      其餘離線鉤子（saveGame/loadGame/changeMap/killMob/gainItem 包裝、結算期間靜音渲染）
 *      一律由 afk-offline.js 外掛自己 monkey-patch，不動核心。
 *   9. castleBuildingsData — js/25 _clanDefaultState / _clanNormalizeState 加入 castleBuildings 資料結構
 *   10. castleButlerNPC — js/11 三座城堡各加一個 Butler NPC 位置與對話分派
 *   11. castleBuildingCollection — js/18 道具收集冊加入第 6 類別「建築」
 *   12. castleExpGoldBonus — js/05 EXP/Gold 計算加入城堡建築加成鉤子
 *   13. castleBuildingStats — js/02 recomputeStats 加入射擊場/狩獵小屋等建築效果
 *   14. castleEnchantRate — js/01 enhanceRollOutcome 加入武器/防具/飾品工坊強化成功率加成
 *
 * 用法：node scripts/apply-core-patches.mjs        （--check 只驗證是否已全部補上、不寫檔）
 */
import { readFileSync, writeFileSync } from 'node:fs';

const CHECK = process.argv.includes('--check');
let changed = 0, already = 0;

// ── 小工具：從指定 index 的 '{' 找到配對的 '}'（略過字串/註解外的括號；此處程式碼夠單純故用簡易配對）──
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  throw new Error('matchBrace: 找不到配對的 }（自 index ' + openIdx + '）');
}

// ── 補丁 1：抽出 maybeSpawnMobs ────────────────────────────────
function patchMaybeSpawnMobs() {
  const FILE = 'js/03-combat-core.js';
  let s = readFileSync(FILE, 'utf8');

  if (/function\s+maybeSpawnMobs\s*\(/.test(s)) { already++; return; }   // 冪等

  // 錨點：出怪判定那段的開頭註解（上游原文，穩定）
  const ANCHOR = '// === 出怪判定：以邏輯 tick';
  const aIdx = s.indexOf(ANCHOR);
  if (aIdx < 0) throw new Error(`[${FILE}] 找不到出怪判定錨點「${ANCHOR}」——上游可能改寫了 tick 出怪段，請人工檢查後更新錨點。`);

  // 錨點之後第一個 '{' 就是那塊的開頭；找它的配對 '}'
  const openIdx = s.indexOf('{', aIdx);
  if (openIdx < 0) throw new Error(`[${FILE}] 錨點後找不到出怪塊的 '{'。`);
  const closeIdx = matchBrace(s, openIdx);
  const body = s.slice(openIdx + 1, closeIdx);   // 塊內程式碼（不含外層大括號）

  // 在 function tick() 之前插入具名函式；把原塊替換成呼叫
  const TICK_ANCHOR = 'function tick() {';
  const tIdx = s.indexOf(TICK_ANCHOR);
  if (tIdx < 0) throw new Error(`[${FILE}] 找不到「${TICK_ANCHOR}」錨點。`);

  const fnDef =
    '// 🔌 加掛版補丁(apply-core-patches)：出怪排程抽成具名函式，供 afk-offline 離線快速結算與 tick() 共用同一份排程。\n' +
    'function maybeSpawnMobs() {' + body + '}\n';

  // 先替換塊（用 index 由後往前處理避免位移）
  s = s.slice(0, openIdx) + '{ maybeSpawnMobs(); }' + s.slice(closeIdx + 1);
  // 重新定位 tick 錨點（前面替換過，位置變了，但 tick 在 aIdx 之前，未受影響——保險起見重找）
  const tIdx2 = s.indexOf(TICK_ANCHOR);
  s = s.slice(0, tIdx2) + fnDef + s.slice(tIdx2);

  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] maybeSpawnMobs 抽取完成（${FILE}）`);
}

// ── 補丁 2：gainItem 自帶強化值鉤子（偽傳統／自動衝裝）────────────
//   上游把傳統模式挖掉後 `let _tEn = 0;` 寫死。改成呼叫外掛鉤子 window.__afkTradRollEn(d, forceNormal, _noAffixCtx)：
//   afk-traditional.js 提供它 → 對「該角色有開偽傳統 + 非商店(forceNormal 假) + 裝備」回傳隨機強化值，其餘回 0。
//   未載外掛/未開 → 恆 0，與原版完全一致。詞綴/疊加/簽章全走上游原路（en 在簽章之前就定好，堆疊正確）。
function patchTradEnHook() {
  const FILE = 'js/08-items-equip.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('__afkTradRollEn')) { already++; return; }

  const ANCHOR = 'let _tEn = 0;   // 🏛️ v3.0.83 傳統模式已取消：掉落自帶強化值停用（任何來源恆 +0·手動強化照常）';
  if (s.indexOf(ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 gainItem 的 _tEn 錨點——上游可能改寫了掉落強化段，請人工檢查後更新錨點。`);

  const REPLACE = "let _tEn = (typeof window.__afkTradRollEn === 'function') ? (window.__afkTradRollEn(d, forceNormal, _noAffixCtx) || 0) : 0;   // 🔌 加掛版補丁：偽傳統(自動衝裝)自帶強化值鉤子（外掛 afk-traditional 提供；未載/未開→0）";
  s = s.replace(ANCHOR, REPLACE);

  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] gainItem _tEn 偽傳統鉤子（${FILE}）`);
}

// ── 補丁 3：存檔位 8 → 16（加掛版原有功能，上游只有 8 格）──────────
//   上游把格數硬寫死在多處：js/13 匯入時的「同角色重複」掃描、js/06 allySlotList（招募）與傭兵受僱
//   登記的四處掃描、js/05 安塔瑞斯每日通關遷移、js/25 clanScanRoles（血盟成員/盟主判定）、
//   js/28 PVP 挑戰自己其他角色的清單。
//   改成用 SAVE_SLOT_MAX=16（定義於 js/13，執行期全域，afk-loadslots/afk-wiki/afk-diag 的選角面板也讀它）。
//   選角畫面本身不必改核心：上游是分頁式卡片（每頁 4 格），afk-loadslots 自行擴充頁數。
function patch16Slots() {
  // js/13：定義 SAVE_SLOT_MAX + 匯入重複掃描涵蓋全部格
  const F13 = 'js/13-shop-save.js';
  let s13 = readFileSync(F13, 'utf8');
  if (!s13.includes('SAVE_SLOT_MAX')) {
    const A1 = "function slotSummary(n){ return _summaryFromRaw(_lzGet('lineage_idle_save_' + n)); }";
    if (s13.indexOf(A1) < 0) throw new Error(`[${F13}] 找不到 slotSummary 錨點——上游可能改了存檔位邏輯。`);
    s13 = s13.replace(A1,
      "const SAVE_SLOT_MAX = 16;   // 🔌 加掛版補丁：存檔位 8 → 16（匯入重複掃描/傭兵招募/選角面板共用）\n" + A1);
    // 匯入存檔時掃「同一角色是否已存在別格」——沒放大就掃不到第 9~16 格，會讓同角色重複進來
    const A2 = "for(let slotN = 1; slotN <= 8; slotN++){";
    if (s13.indexOf(A2) < 0) throw new Error(`[${F13}] 找不到匯入重複掃描 8 格迴圈錨點。`);
    s13 = s13.replace(A2, "for(let slotN = 1; slotN <= SAVE_SLOT_MAX; slotN++){");
    if (!CHECK) writeFileSync(F13, s13);
    changed++;
    console.log(`[patch] 存檔位 16 格（${F13}）`);
  } else { already++; }

  // js/06：傭兵招募可選存檔位 + 傭兵受僱登記的存檔位掃描
  const F06 = 'js/06-status-allies.js';
  let s06 = readFileSync(F06, 'utf8');
  let dirty06 = false;
  const A3 = "['1','2','3','4','5','6','7','8'].filter(n => n !== String(currentSlot))";
  if (s06.indexOf(A3) >= 0) {
    s06 = s06.replace(A3, "(function(){ let a=[]; for(let n=1;n<=SAVE_SLOT_MAX;n++){ if(String(n)!==String(currentSlot)) a.push(String(n)); } return a; })()");
    dirty06 = true;
    changed++;
    console.log(`[patch] 傭兵招募 16 格（${F06}）`);
  } else if (!s06.includes('SAVE_SLOT_MAX')) {
    throw new Error(`[${F06}] 找不到 allySlotList 8 格錨點——上游可能改了招募邏輯。`);
  } else { already++; }

  // 傭兵受僱登記（bootstrap 遷移／受僱查詢／選角徽章／獨佔判定）四處各自掃全部存檔位。
  //   漏放大 → 僱主在第 9~16 格時，傭兵不顯示徽章、不受安全區限制、也擋不住被第二位僱主重複招募。
  const A3B_FROM = 'for (let n = 1; n <= 8; n++) {';
  const A3B_TO = 'for (let n = 1; n <= SAVE_SLOT_MAX; n++) {';
  if (s06.indexOf(A3B_FROM) >= 0) {
    s06 = s06.split(A3B_FROM).join(A3B_TO);
    dirty06 = true;
    changed++;
    console.log(`[patch] 傭兵受僱掃描 16 格（${F06}）`);
  } else if (s06.indexOf(A3B_TO) < 0) {
    throw new Error(`[${F06}] 找不到傭兵受僱登記的 8 格迴圈錨點——上游可能改了受僱判定，請確認第 9~16 格仍被掃到。`);
  } else { already++; }
  if (dirty06 && !CHECK) writeFileSync(F06, s06);

  // js/05：不再需要補丁——上游 v3.8.34 把安塔瑞斯每日通關改成「逐參與者（enSeed 身分）各記一把 key」，
  //   原本那個「掃存檔位 1~8 遷移舊資料」的迴圈整段移除，沒有 8 格上限可補。第 9~16 格照樣正常。

  // js/25：血盟成員掃描（成員清單＋貢獻度、clanLeaderRole 找盟主、城鎮 NPC 的「有無君主」判斷都經這裡）
  const F25 = 'js/25-clan-system.js';
  let s25 = readFileSync(F25, 'utf8');
  const A4 = "for (let slot = 1; slot <= 8; slot++) {";
  if (s25.indexOf(A4) >= 0) {
    s25 = s25.replace(A4, "for (let slot = 1; slot <= SAVE_SLOT_MAX; slot++) {");
    if (!CHECK) writeFileSync(F25, s25);
    changed++;
    console.log(`[patch] 血盟成員掃描 16 格（${F25}）`);
  } else if (!s25.includes('SAVE_SLOT_MAX')) {
    throw new Error(`[${F25}] 找不到 clanScanRoles 8 格迴圈錨點——上游可能改了血盟成員掃描。`);
  } else { already++; }

  // js/28：PVP 面板「挑戰自己其他角色」的候選清單
  const F28 = 'js/28-pvp-arena.js';
  let s28 = readFileSync(F28, 'utf8');
  const A5 = "for (let n = 1; n <= 8; n++) {";
  if (s28.indexOf(A5) >= 0) {
    s28 = s28.replace(A5, "for (let n = 1; n <= SAVE_SLOT_MAX; n++) {");
    if (!CHECK) writeFileSync(F28, s28);
    changed++;
    console.log(`[patch] PVP 對手清單 16 格（${F28}）`);
  } else if (!s28.includes('SAVE_SLOT_MAX')) {
    throw new Error(`[${F28}] 找不到 PVP 對手清單 8 格迴圈錨點——上游可能改了 PVP 面板。`);
  } else { already++; }
}

// ── 補丁 4：js/22 寵/召 sprite ticker 改「間接呼叫」──────────────
//   上游 setInterval(_petAnimApply, …) 直接捕捉原函式參照 → afk-powersave 的 wrapper 攔不到
//   (關戰鬥動畫後寵物/召喚照樣動)。改箭頭間接呼叫=每次經全域解析,外掛包得住。
function patchPetAnimTicker() {
  const FILE = 'js/22-pets.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('setInterval(() => { _petAnimApply(); }')) { already++; return; }
  const ANCHOR = 'setInterval(_petAnimApply, 1000 / PET_ANIM_FPS);';
  if (s.indexOf(ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 _petAnimApply ticker 錨點——上游可能改寫了寵物動畫排程。`);
  s = s.replace(ANCHOR, 'setInterval(() => { _petAnimApply(); }, 1000 / PET_ANIM_FPS);   // 🔌 加掛版補丁:間接呼叫讓外掛(省電模式)wrapper 攔得住;直接傳參照會被捕死原函式');
  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] 寵/召 sprite ticker 間接呼叫（${FILE}）`);
}

// ── 補丁 5：js/07 迴避頭目 與 外掛「自動找BOSS」互斥 ─────────────
//   afk-bossring 召來的王若被「迴避頭目(瞬移卷軸)」自動逃離立刻瞬移走=功能互咬。
//   逃離條件加 !_huntBoss(讀外掛暴露的 AFK_BOSSRING.huntActive();外掛未載=false 照常)。
function patchBossHuntEscape() {
  const FILE = 'js/07-skills-cast.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('AFK_BOSSRING')) { already++; return; }
  const A1 = "let tChk = document.getElementById('set-teleport');";
  const A2 = 'if (tChk && tChk.checked && mapState.mobs.some(m => m && m.boss && !m.noAutoTeleport)';
  if (s.indexOf(A1) < 0 || s.indexOf(A2) < 0) throw new Error(`[${FILE}] 找不到迴避頭目錨點——上游可能改寫了自動瞬移段。`);
  s = s.replace(A1, A1 + "\n        let _huntBoss = !!(window.AFK_BOSSRING && window.AFK_BOSSRING.huntActive && window.AFK_BOSSRING.huntActive());   // 🔌 加掛版補丁:外掛「自動找BOSS」進行中→抑制逃離(否則剛召來的王立刻被瞬移走);外掛未載入=false 照常");
  s = s.replace(A2, 'if (tChk && tChk.checked && !_huntBoss && mapState.mobs.some(m => m && m.boss && !m.noAutoTeleport)');
  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] 迴避頭目×自動找BOSS互斥（${FILE}）`);
}

// ── 補丁 6：js/08 useItem 加 keepModal 參數 ─────────────────────
//   外掛自動瞬移(afk-bossring)非 silent 使用卷軸時,上游會 closeModal() 把玩家開著的物品視窗關掉。
//   加第三參數 keepModal 讓自動路徑保留視窗(未傳=false,原行為不變)。
function patchUseItemKeepModal() {
  const FILE = 'js/08-items-equip.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('keepModal')) { already++; return; }
  const A1 = 'function useItem(u, silent = false) {';
  const A2 = "if(!silent && document.getElementById('item-modal').classList.contains('hidden') === false";
  if (s.indexOf(A1) < 0 || s.indexOf(A2) < 0) throw new Error(`[${FILE}] 找不到 useItem 錨點——上游可能改寫了簽名或關窗段。`);
  s = s.replace(A1, 'function useItem(u, silent = false, keepModal = false) {   // 🔌 加掛版補丁 keepModal:自動觸發(如外掛自動瞬移)非 silent 使用時,不關玩家開著的物品視窗');
  s = s.replace(A2, "if(!silent && !keepModal && document.getElementById('item-modal').classList.contains('hidden') === false");
  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] useItem keepModal（${FILE}）`);
}

// ── 補丁 7：js/10 「立即賣出」不再無條件強制套規則 ─────────────────
//   上游 sellAutoSellItemsNow 無條件 applyAutoSellRules(true)(force)→玩家把自動販賣總開關關掉後
//   按「立即賣出」,仍當場依規則把沒標過的裝備標成廢品賣掉(玩家回報:武官護鎧被莫名賣掉;舊 main ab230707dc)。
//   改為只有總開關開著才 force;關閉時只賣玩家已手動標記的廢品(applyAutoSellRules(false) 會清規則舊標記)。
function patchSellNowNoForce() {
  const FILE = 'js/10-ui-tabs.js';
  let s = readFileSync(FILE, 'utf8');
  if (s.includes('applyAutoSellRules(player.autoSellOn!==false)')) { already++; return; }
  const ANCHOR = 'function sellAutoSellItemsNow(){_readAutoSellForm();_asBackup=null;applyAutoSellRules(true);';
  if (s.indexOf(ANCHOR) < 0) throw new Error(`[${FILE}] 找不到 sellAutoSellItemsNow 錨點——上游可能改寫了立即賣出,請人工檢查(此補丁防「關閉自動販賣仍被強制套規則賣裝」)。`);
  s = s.replace(ANCHOR, 'function sellAutoSellItemsNow(){_readAutoSellForm();_asBackup=null;applyAutoSellRules(player.autoSellOn!==false);   /* 🔌 加掛版補丁:總開關關閉→不套規則,只賣手動標記的廢品 */');
  s = s.replace('// 🔧 v2.6.91 force=true：即使開關關閉也強制依規則標記後立即賣', '// 🔌 加掛版補丁:開關開著才 force 套規則;關閉時只賣手動標記(上游原為無條件 force)');
  if (!CHECK) writeFileSync(FILE, s);
  changed++;
  console.log(`[patch] 立即賣出不強制套規則（${FILE}）`);
}


// ── 補丁 9：js/25 _clanDefaultState / _clanNormalizeState 加入 castleBuildings 資料結構 ──
//   城堡建築資料存於 st.modes[mode].castleBuildings（血盟層級），格式：
//   { weapon_shop:{lv,startAt,finishAt}, armor_shop:{lv,startAt,finishAt}, ... }
//   需在 _clanDefaultState 初始化空物件、_clanNormalizeState 做數值正規化。
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

// ── 補丁 8：js/05 每殺一隻怪都掃整個背包找「死亡騎士之印記」→ 先判地區再掃 ──────
//   原式:!_kbNoReward && player.inv.some(...印記...) && mapRegionOf(...) === 'rastabad'
//   `.some()` 是 O(背包長度) 且**每次擊殺都跑**,而後面那個地區判斷極便宜、又幾乎總是 false(只有拉斯塔巴德成立)。
//   純粹把 && 的順序對調(兩者都無副作用,短路結果完全相同):大背包玩家離線補跑省下可觀時間(6x 限速實測)。
function patchInsigniaOrder() {
  const FILE = 'js/05-kill-progression.js';
  let s = readFileSync(FILE, 'utf8');
  const FROM = "if (!_kbNoReward && player.inv.some(i => i.id === 'item_dk_insignia') && typeof mapRegionOf === 'function' && mapRegionOf(mapState.current) === 'rastabad')";
  const TO   = "if (!_kbNoReward && typeof mapRegionOf === 'function' && mapRegionOf(mapState.current) === 'rastabad' && player.inv.some(i => i.id === 'item_dk_insignia'))";
  if (s.indexOf(FROM) >= 0) {
    s = s.replace(FROM, TO);
    if (!CHECK) writeFileSync(FILE, s);
    changed++;
    console.log(`[patch] 聖地遺物判斷改先判地區（${FILE}）`);
  } else if (s.indexOf(TO) < 0) {
    throw new Error(`[${FILE}] 找不到聖地遺物(item_dk_insignia)判斷錨點——上游可能改寫了那段掉落。`);
  } else { already++; }
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

const PATCHES = [patchMaybeSpawnMobs, patchTradEnHook, patch16Slots, patchPetAnimTicker, patchBossHuntEscape, patchUseItemKeepModal, patchSellNowNoForce, patchInsigniaOrder, patchCastleBuildingsData, patchCastleButlerNPC, patchCastleBuildingCollection, patchCastleExpGoldBonus, patchCastleButlerNpcList, patchCastleBuildingStats, patchCastleEnchantRate, patchClanBuffExtraMp];

try {
  for (const p of PATCHES) p();
} catch (e) {
  console.error('❌ apply-core-patches 失敗：' + e.message);
  process.exit(1);
}

if (CHECK) {
  if (changed > 0) { console.error(`❌ --check：有 ${changed} 個核心補丁尚未套用（請跑 node scripts/apply-core-patches.mjs）`); process.exit(1); }
  console.log(`✅ --check：全部 ${already} 個核心補丁均已就位。`);
} else {
  console.log(`✅ apply-core-patches 完成：新套用 ${changed}、已存在 ${already}。`);
}
