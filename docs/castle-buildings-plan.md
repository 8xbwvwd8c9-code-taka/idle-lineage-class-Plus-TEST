# Castle Buildings System — Implementation Plan

> **Version:** 2.0 (Restructured)
> **Last Updated:** 2026/07/29
> **Status:** Plan Mode

---

## Table of Contents

- [1. System Overview](#1-system-overview)
- [2. Five Buildings Overview](#2-five-buildings-overview)
- [3. Upgrade Costs Detail](#3-upgrade-costs-detail)
- [4. Upgrade System](#4-upgrade-system)
  - [4.1 Upgrade Workflow](#41-upgrade-workflow)
  - [4.2 Validation Rules (Ordered)](#42-validation-rules-ordered)
  - [4.3 Parameters Modified After Completion](#43-parameters-modified-after-completion)
  - [4.4 Save Rules](#44-save-rules)
- [5. Construction Completion](#5-construction-completion)
- [6. Construction Acceleration](#6-construction-acceleration)
- [7. Castle Ownership Rules](#7-castle-ownership-rules)
  - [7.1 Castle Lost](#71-castle-lost)
  - [7.2 Castle Reclaimed](#72-castle-reclaimed)
  - [7.3 Butler NPC Behavior](#73-butler-npc-behavior)
  - [7.4 UI Behavior on Ownership Change](#74-ui-behavior-on-ownership-change)
- [8. NPC Butler](#8-npc-butler)
- [9. UI Layout](#9-ui-layout)
  - [9.1 Butler Panel Layout](#91-butler-panel-layout)
  - [9.2 Building Card States](#92-building-card-states)
  - [9.3 UI Refresh Rules](#93-ui-refresh-rules)
- [10. Building Collection Album](#10-building-collection-album)
- [11. Effect Integration Hooks](#11-effect-integration-hooks)
- [12. Technical Architecture](#12-technical-architecture)
  - [12.1 New Plugin File](#121-new-plugin-file)
  - [12.2 Core Patches (錨點式核心補丁)](#122-core-patches-錨點式核心補丁)
  - [12.3 Plugin Injection](#123-plugin-injection)
  - [12.4 Data Structure](#124-data-structure)
- [13. Data Migration](#13-data-migration)
- [14. Permissions](#14-permissions)
- [15. Icon and Visual Style](#15-icon-and-visual-style)
- [16. Future Ideas (Not In Scope)](#16-future-ideas-not-in-scope)
- [Appendix: Referenced Game Systems](#appendix-referenced-game-systems)

---

## 1. System Overview

After a blood pledge (clan) conquers a castle, the clan gets a **Butler NPC**. The Royal class clan leader can build and upgrade **5 buildings**.

### Key Design Principles

1. **Data follows the clan, not the castle location.**
   - All building data is in `st.modes[mode].castleBuildings`.
   - Moving from Windwood to Kent preserves all buildings.

2. **Buildings only work when holding a castle.**
   - Effects only apply when `siegeVictoryActive() === true`.

3. **Royal leader only for actions.**
   - Only the Royal class clan founder can build/upgrade/accelerate/harvest.
   - Regular members can view only.

4. **Real-time construction queue with Diamond acceleration.**

---

## 2. Five Buildings Overview

| Building | Emoji | Effect | Cost Type | LV1 | LV5 |
|---|---|---|---|---|---|
| Weapon Shop | 🔪 | Weapon Enchant +0.5%~2.5% | Scroll(W)+Bless(W) | +0.5% | +2.5% |
| Armor Shop | 🛡️ | Armor Enchant +0.5%~2.5% | Scroll(A)+Bless(A) | +0.5% | +2.5% |
| Prison | ⛓️ | EXP Gain +1%~+5% | Gold | +1% | +5% |
| Gold Vault | 🪙 | Gold Gain +1%~+5% | Gold | +1% | +5% |
| Treasure Vault | 💎 | Auto-produce Dragon Diamonds | Dragon Diamonds | 1/pull | 10/pull |

> **Note:** Gold Vault is renamed from the original "Treasure Vault" concept. The current Treasure Vault is **new** for Diamond production.

---

## 3. Upgrade Costs Detail

### 3.1 Weapon Shop

| LV | Enchant+ | Scroll(W) | Bless(W) | Time |
|---|---|---|---|---|
| 1 | +0.5% | 100 | 1 | 1hr |
| 2 | +1.0% | 200 | 2 | 6hr |
| 3 | +1.5% | 300 | 3 | 12hr |
| 4 | +2.0% | 400 | 4 | 18hr |
| 5 | +2.5% | 500 | 5 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed

### 3.2 Armor Shop

| LV | Enchant+ | Scroll(A) | Bless(A) | Time |
|---|---|---|---|---|
| 1 | +0.5% | 100 | 1 | 1hr |
| 2 | +1.0% | 200 | 2 | 6hr |
| 3 | +1.5% | 300 | 3 | 12hr |
| 4 | +2.0% | 400 | 4 | 18hr |
| 5 | +2.5% | 500 | 5 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed

### 3.3 Prison

| LV | EXP+ | Gold Cost | Time |
|---|---|---|---|
| 1 | +1% | 1,000,000 | 1hr |
| 2 | +2% | 2,000,000 | 6hr |
| 3 | +3% | 3,000,000 | 12hr |
| 4 | +4% | 4,000,000 | 18hr |
| 5 | +5% | 5,000,000 | 24hr |

### 3.4 Gold Vault

| LV | Gold+ | Gold Cost | Time |
|---|---|---|---|
| 1 | +1% | 1,000,000 | 1hr |
| 2 | +2% | 2,000,000 | 6hr |
| 3 | +3% | 3,000,000 | 12hr |
| 4 | +4% | 4,000,000 | 18hr |
| 5 | +5% | 5,000,000 | 24hr |

### 3.5 Treasure Vault

| LV | Output/pull | Cost(DD) | Time |
|---|---|---|---|
| 1 | 1 | 1 | 1hr |
| 2 | 2 | 5 | 6hr |
| 3 | 4 | 12 | 12hr |
| 4 | 7 | 25 | 18hr |
| 5 | 10 | 50 | 24hr |

**Production Rules:**
- **Interval:** every 60 minutes
- **Storage cap:** 24 accumulations max (24 hours worth)
- **Overflow:** stops producing when capped
- **Harvest:** click button, diamonds go to inventory
- **Offline:** continues accumulating (capped at 24)


## 4. Upgrade System

### 4.1 Upgrade Workflow

All five buildings use the same upgrade workflow.

```
Player clicks Upgrade
        │
        ▼
┌─ Verify castle ownership ──────────────────────┐
│  siegeVictoryActive() === true                  │
│  If false → "Your clan does not currently       │
│              own a castle." → STOP              │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Verify permissions ───────────────────────────┐
│  clanIsLeaderRole(player) && Royal class        │
│  If false → "Only the Royal clan leader may     │
│              manage castle buildings." → STOP   │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Verify building state ────────────────────────┐
│  constructionEnd <= Date.now()                  │
│  If constructing → show remaining time,         │
│                    disable Upgrade → STOP       │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Verify level ─────────────────────────────────┐
│  Current Level < 5                              │
│  If LV5 → show MAX, hide Upgrade → STOP        │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Read upgrade config ──────────────────────────┐
│  BUILDING_DATA[buildingId][nextLevel]           │
│  → materials, gold cost, DD cost, duration,     │
│    target effect value                          │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Verify required resources ────────────────────┐
│  Weapon Shop:  Scroll(W) + Bless(W)             │
│  Armor Shop:   Scroll(A) + Bless(A)             │
│  Prison:       Gold                             │
│  Gold Vault:   Gold                             │
│  Treasure Vault: Dragon Diamonds                │
│  If insufficient → highlight missing,           │
│                    disable Confirm → STOP       │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Consume resources ────────────────────────────┐
│  Remove items, gold, Dragon Diamonds            │
│  Call saveGame()                                │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Create construction task ─────────────────────┐
│  constructionStart = Date.now()                 │
│  constructionEnd   = Date.now() + buildTime     │
│  targetLevel       = currentLevel + 1           │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Save & Refresh ───────────────────────────────┐
│  saveGame()                                     │
│  Refresh Butler UI                              │
└─────────────────────────────────────────────────┘
        │
        ▼
  Construction timer begins.
```

### 4.2 Validation Rules (Ordered)

The following validation order **MUST** always be respected. If any validation fails:

- Do **NOT** consume resources.
- Do **NOT** modify building data.
- Do **NOT** call `saveGame()`.
- Display an error message.

| # | Validation | Description |
|---|------------|-------------|
| 1 | Building exists | `buildingId` is valid |
| 2 | Clan owns a castle | `siegeVictoryActive() === true` |
| 3 | Player is Royal Leader | `clanIsLeaderRole(player)` && Royal class |
| 4 | Building is not constructing | `constructionEnd <= Date.now()` |
| 5 | Building level < 5 | Current level is not maxed |
| 6 | Required items exist | Item type is present in inventory |
| 7 | Required item quantity sufficient | Enough scrolls, bless scrolls |
| 8 | Enough Gold | For Prison / Gold Vault |
| 9 | Enough Dragon Diamonds | For Treasure Vault |
| 10 | Target level exists | `BUILDING_DATA[buildingId][nextLevel]` is defined |

### 4.3 Parameters Modified After Completion

Only the following parameters may change after a successful upgrade.

| Building | Modified Parameters | Do NOT Reset |
|----------|-------------------|--------------|
| Weapon Shop | `level++`, `constructionStart=0`, `constructionEnd=0`, enchant bonus | — |
| Armor Shop | `level++`, `constructionStart=0`, `constructionEnd=0`, enchant bonus | — |
| Prison | `level++`, `constructionStart=0`, `constructionEnd=0`, EXP bonus | — |
| Gold Vault | `level++`, `constructionStart=0`, `constructionEnd=0`, Gold bonus | — |
| Treasure Vault | `level++`, `constructionStart=0`, `constructionEnd=0`, production rate | `accumulated`, `lastHarvestTime` |

> **Treasure Vault special rule:** Only future production uses the upgraded production rate. Accumulated treasure and last harvest time are preserved.

### 4.4 Save Rules

The system **MUST** immediately call `saveGame()` after:

| Event | Description |
|-------|-------------|
| ✅ Upgrade starts | Materials consumed, construction timer set |
| ✅ Construction completes | Level increased, effect applied |
| ✅ Acceleration | Dragon Diamonds spent, time reduced |
| ✅ Treasure harvested | Diamonds moved to inventory |
| ✅ Building Collection unlocked | New dex entry registered |

> Never delay saving until the player manually saves the game.

---

## 5. Construction Completion

Construction automatically completes when `constructionEnd <= Date.now()`. No player interaction is required.

```
constructionEnd <= Date.now()
        │
        ▼
┌─ Increase level ───────────────────────────────┐
│  building.level += 1                            │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Reset construction state ─────────────────────┐
│  constructionStart = 0                          │
│  constructionEnd   = 0                          │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Apply new effect ─────────────────────────────┐
│  Effect value from BUILDING_DATA[level]         │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Register Building Collection ─────────────────┐
│  Key: weaponShop_lv3, armorShop_lv4, ...        │
│  Call castleBuildingDexCheck()                  │
└─────────────────────────────────────────────────┘
        │
        ▼
┌─ Save & Notify ────────────────────────────────┐
│  saveGame()                                     │
│  Refresh Butler UI                              │
│  Show completion notification                   │
└─────────────────────────────────────────────────┘
```

---

## 6. Construction Acceleration

| Rule | Detail |
|------|--------|
| Rate | 1 Dragon Diamond = reduce 1 hour |
| Stacking | Can use multiple at once |
| Minimum | 0 (instant complete) |
| Permission | Only Royal clan leader can accelerate |
| UI | Button shows current Diamond count |

---

## 7. Castle Ownership Rules

All castle buildings are **permanently owned by the clan**. However, building effects and management are only available while the clan currently owns a castle.

### 7.1 Castle Lost

When the clan loses ownership of a castle:

| Category | Behavior |
|----------|----------|
| **Construction** | Any building under construction is **immediately cancelled**. Progress is NOT preserved. `constructionStart=0`, `constructionEnd=0`, `targetLevel=null` |
| **Materials** | Already consumed materials are **NOT refunded** (items, gold, Dragon Diamonds) |
| **Building Effects** | All bonuses immediately become inactive (Weapon, Armor, Prison EXP, Gold Vault) |
| **Treasure Vault** | Production immediately stops. No offline production. Existing accumulated treasure remains unchanged. Players may not harvest. |
| **Acceleration** | Accelerate button disabled. Dragon Diamonds cannot be used. |
| **Save** | `saveGame()` must be called immediately |

### 7.2 Castle Reclaimed

When the clan captures any castle again:

| Category | Behavior |
|----------|----------|
| **Buildings** | All previous building levels remain unchanged. Data restored from clan save. |
| **Construction** | Cancelled construction does **NOT** resume. Players must manually start the upgrade again. |
| **Treasure Vault** | Production resumes using current building level, starting from current server time. Lost production time is NOT recovered. |
| **Effects** | All building bonuses become active again. |
| **Save** | `saveGame()` must be called. |

### 7.3 Butler NPC Behavior

The Butler NPC **never disappears**.

| Scenario | Display |
|----------|---------|
| **Clan owns a castle** | Full Building Management: Upgrade, Acceleration, Treasure Harvest, Building Collection |
| **Clan does NOT own a castle** | Butler dialogue only. Show current building levels + historical records. Hide all management functions (Upgrade, Accelerate, Harvest). Display: *"Your clan does not currently own a castle. Capture a castle to reactivate castle facilities."* |

### 7.4 UI Behavior on Ownership Change

**When castle ownership is lost:**
- Immediately refresh the Butler panel
- Disable: Upgrade, Accelerate, Harvest
- Gray out: Building cards, Building effects
- Display: `Status: Castle Lost`

**When a castle is captured again:**
- Immediately refresh: Building cards, Building effects, Treasure production, Upgrade buttons
- No manual refresh or reopening of the Butler window is required

---

## 8. NPC Butler

| Property | Value |
|----------|-------|
| ID | `npc_butler` |
| Location | Castle towns only (Kent / Windwood / Heine) |
| Visibility | Only when `siegeVictoryActive() === true` |
| Royal leader | Full panel (build/upgrade/accelerate/harvest) |
| Members | View only |
| Sprite | Uses existing NPC sprite system |

---

## 9. UI Layout

### 9.1 Butler Panel Layout

The Butler panel is a **floating modal**:

```
┌─────────────────────────────────────────────────────┐
│  Castle Construction Management — Butler             │
│  [Building Collection Album]                         │
├─────────────────────────────────────────────────────┤
│  [Card 1]  [Card 2]  [Card 3]  [Card 4]  [Card 5]  │
├─────────────────────────────────────────────────────┤
│  Currently Building: [Timer] [Progress] [Accelerate] │
├─────────────────────────────────────────────────────┤
│  Production Log                                      │
└─────────────────────────────────────────────────────┘
```

Each card shows:
- Icon (color by level)
- Name + LV
- Effect value
- Action button
- Treasure: red badge + HARVEST button

### 9.2 Building Card States

Each building card must update according to its current state.

| State | Condition | Display |
|-------|-----------|---------|
| **🔒 Locked** | Clan owns no castle | Gray card, effect disabled, Upgrade hidden |
| **✅ Available** | Castle owned, not constructing, level < 5 | Upgrade button enabled |
| **🔧 Constructing** | `constructionEnd > Date.now()` | Countdown timer, progress bar, Accelerate button, Upgrade disabled |
| **✔️ Completed** | `constructionEnd <= Date.now()` | New Level, Updated Effect, Upgrade available |
| **⭐ Max Level** | Level == 5 | Gold border, MAX badge, Upgrade hidden |
| **💎 Treasure Ready** | `accumulated > 0` | Red notification badge, Harvest button enabled |

### 9.3 UI Refresh Rules

Immediately refresh the Butler panel after:

| Trigger | Refresh Items |
|---------|---------------|
| Upgrade starts | Building Level, Current Effect, Upgrade Cost, Countdown Timer, Progress Bar, Treasure Badge, Collection Status, Button States |
| Upgrade completes | Same as above |
| Acceleration | Same as above |
| Harvest | Same as above |
| Building Collection unlocked | Same as above |

> The player must **NOT** reopen the Butler window to see updated information.

---

## 10. Building Collection Album

A 5th collection book alongside equip/misc/card/relic. **25 items total** (5 buildings × 5 levels).

| Aspect | Detail |
|--------|--------|
| **Registration** | Auto-registered when building reaches each level. Key format: `weaponShop_lv3`. Stored in clan state (shared by all members). |
| **Full Collection Reward** | Title: **Great Castle Lord**. All building effects +1% extra. Example: LV5 Weapon Shop +2.5% becomes +3.5%. |
| **UI** | 5×5 grid of building icons. Collected: full color. Uncollected: gray silhouette. |

---

## 11. Effect Integration Hooks

| Building | Hook Location | Implementation |
|----------|---------------|----------------|
| **Weapon Shop** | Weapon enchant success rate calculation | Add `getCastleBuildingEffect(weaponShop)` to base rate |
| **Armor Shop** | Armor enchant success rate calculation | Same pattern as weapon shop |
| **Prison** | `js/05-kill-progression.js` (EXP calculation) | `exp = Math.floor(exp * (1 + bonus/100))` |
| **Gold Vault** | `js/05-kill-progression.js` (Gold calculation) | `gold = Math.floor(gold * (1 + bonus/100))` |
| **Treasure Vault** | No external hook needed | Self-contained production system |

---

## 12. Technical Architecture

> ⚠️ **CLAUDE.md 架構約束：** 本專案為「上游鏡像＋外掛層」架構。核心檔 (`js/NN-*.js`、`css/*`、`index.html`) 是上游鏡像，**絕不直接手改**。所有功能透過外掛 (`afk-*.js`) 或錨點式核心補丁 (`scripts/apply-core-patches.mjs`) 實現。

### 12.1 New Plugin File

**`afk-castle-buildings.js`** — 外掛層檔案，置於專案根目錄，遵循外掛通用守則。

透過 `scripts/afk-plugin-block.html` 加入 `<script>` 載入（載入順序依功能依賴決定）。

| Function | Description | Approach |
|----------|-------------|----------|
| `BUILDING_DATA` | Tables (costs, effects, times per level) | 外掛內常數定義 |
| `getCastleBuildings()` | Read from `st.modes[mode].castleBuildings` | 外掛函式，直接讀取 |
| `castleStartBuilding(buildingId)` | Check mats, deduct, start timer | 外掛函式，monkey-patch 或獨立呼叫 |
| `castleAccelerate(buildingId, count)` | Consume Diamonds, reduce time | 外掛函式 |
| `castleCompleteBuilding(buildingId)` | Level up, register collection | 外掛函式 |
| `castleTreasureTick()` | Called by `setInterval`, accumulate production | 外掛內 `setInterval` |
| `castleHarvestTreasure()` | Collect Diamonds to inventory | 外掛函式 |
| `getCastleBuildingLevel(buildingId)` | Returns 0–5 (0 if no castle) | 外掛函式 |
| `getCastleBuildingEffect(buildingId)` | Returns percentage value | 外掛函式 |
| `castleBuildingDexCheck()` | Register collection on level up | 外掛函式 |
| `renderCastleBuildingsPanel()` | Generate Butler panel HTML | 外掛函式，注入 DOM |
| `renderBuildingAlbum()` | Generate collection album view | 外掛函式，注入 DOM |

**外掛開關註冊：** 檔頭加入 `AFK_TOGGLES.register({ id:'castleBuildings', name:'城堡建築系統', desc:'城鎮建築管理與升級', group:'功能', def:true })`，並在執行前檢查 `if (!AFK_TOGGLES.enabled('castleBuildings')) return;`

### 12.2 Core Patches (錨點式核心補丁)

需要在核心檔中插入資料結構或修改行為時，透過 `scripts/apply-core-patches.mjs` 以「上游原文特徵字串」定位，冪等執行。

| Target File | Patch Description | Anchor (特徵字串) |
|-------------|-------------------|-------------------|
| `js/25-clan-system.js` | `_clanDefaultState()` 內加入 `castleBuildings` 預設結構 | 搜尋 `castleBuildings` 或 `_clanDefaultState` 內既有物件 literal |
| `js/25-clan-system.js` | `_clanNormalizeState()` 內加入 `castleBuildings` 遷移邏輯 | 搜尋 `_clanNormalizeState` 函式體 |
| `js/11-world-map.js` | 在 castle 城鎮的 NPC 列表中加入 Butler NPC | 搜尋對應城鎮的 NPC 陣列定義 |
| `js/18-misc-book.js` | 加入第 5 個 collection 按鈕（building album） | 搜尋 collection 按鈕渲染區塊 |
| `js/05-kill-progression.js` | EXP 計算加入 prison bonus、Gold 計算加入 gold vault bonus | 搜尋 `exp = Math.floor` 或 `gold = Math.floor` 計算行 |
| Enchant files (TBD) | Weapon/armor enchant 成功率加入 building effect bonus | TBD — 需確認 enchant 檔案位置 |

> **原則：** 優先嘗試 monkey-patch（外掛包裝核心全域函式）。只有當核心函式不暴露、無法包裝、或需要改寫資料結構預設值時，才使用錨點式核心補丁。

### 12.3 Plugin Injection

- 在 `scripts/afk-plugin-block.html` 中加入 `<script src="afk-castle-buildings.js"></script>`（載入順序依功能依賴決定）
- 重跑 sync 或手動補進現行 `index.html` 的 `</body>` 前
- 有 DOM 掛點的加入 `scripts/smoke-hooks.mjs` 的 `need`

### 12.4 Data Structure

```js
// Clan-level building data
st.modes[mode].castleBuildings = {
  weaponShop: { level: 0, constructionEnd: 0 },
  armorShop:  { level: 0, constructionEnd: 0 },
  prison:     { level: 0, constructionEnd: 0 },
  goldVault:  { level: 0, constructionEnd: 0 },
  treasure:   { level: 0, constructionEnd: 0, lastHarvestTime: 0, accumulated: 0 }
}

// Player-level collection dex (or in clan state)
player.buildingDex = { weaponShop_lv1: true, ... }
```

---

## 13. Data Migration

No manual migration needed. Old saves get defaults via:

- **錨點式核心補丁**：`scripts/apply-core-patches.mjs` 在 `_clanNormalizeState()` 中插入 `castleBuildings` 初始化邏輯（若缺失則補上預設結構）
- **外掛初始化**：`afk-castle-buildings.js` 在載入時檢查 `player.buildingDex`，若 undefined 則初始化為 `{}`
- All level values default to `0` (not built)

---

## 14. Permissions

| Action | Who |
|--------|-----|
| See Butler NPC | All members (holding castle) |
| View building status | All members |
| Build / Upgrade | Royal clan leader only |
| Accelerate with DD | Royal clan leader only |
| Harvest Treasure | Royal clan leader only |
| View Collection Album | All members (always) |

Uses existing `clanIsLeaderRole(player)` for checks.

---

## 15. Icon and Visual Style

Building icons change color by level:

| Level | Color |
|-------|-------|
| LV1 | Gray |
| LV2 | Bronze |
| LV3 | Silver |
| LV4 | Legendary (blue/purple) |
| LV5 | Gold |

**Implementation:** CSS gradients + emojis for initial version. Can upgrade to custom PNG sprites later.

---

## 16. Future Ideas (Not In Scope)

| Idea | Description |
|------|-------------|
| Castle Tax | 24h auto gold tax distributed by leader |
| Worker Dispatch | Assign members to buildings for bonus |
| Random Events | Surprise rewards from buildings |
| Clan XP Link | Building level milestones give clan buffs |
| Material Quests | All members contribute to upgrades |

---

## Appendix: Referenced Game Systems

| System | File | Key Functions |
|--------|------|---------------|
| Clan State | `js/25-clan-system.js` | `_clanReadState`, `_clanWithLock`, `_clanDefaultState`, `_clanNormalizeState`, `clanGetModeInfo`, `clanIsLeaderRole` |
| Castle | `js/11-world-map.js` | `castleOwnerCity`, `siegeVictoryActive`, `victoryCityCfg`, `SIEGE_CITY` |
| NPC | `js/11-world-map.js` | Town NPC lists, NPC interaction system |
| Collection | `js/18-misc-book.js` | Collection panel, collection buttons |
| EXP/Gold | `js/05-kill-progression.js` | `killMob`, reward calculation |
| Items | `js/08-items-equip.js` | `gainItem`, enchant logic |
| Dragon Diamond | `js/25-clan-system.js` | `clanDonateDiamonds`, existing item |
