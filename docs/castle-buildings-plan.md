# Castle Buildings System — Implementation Plan

> **Version:** 2.1 (Updated with 15-building spec)
> **Last Updated:** 2026/07/29
> **Status:** Plan Mode

---

## Table of Contents

- [1. System Overview](#1-system-overview)
- [2. Buildings Overview](#2-buildings-overview)
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

After a blood pledge (clan) conquers a castle, the clan gets a **Butler NPC**. The Royal class clan leader can build and upgrade **15 buildings**.

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

## 2. Buildings Overview

| # | Building | Emoji | Effect | Cost Type | LV1 | LV5 (Max) |
|---|----------|-------|--------|-----------|-----|-----------|
| 1 | 武器工坊 (Weapon Workshop) | 🔨 | 武器強化成功率 +0.5%~+2.5% | Scroll(W)+Bless(W)+Gold | +0.5% | +2.5% |
| 2 | 防具工坊 (Armor Workshop) | 🛡️ | 盔甲強化成功率 +0.5%~+2.5% | Scroll(A)+Bless(A)+Gold | +0.5% | +2.5% |
| 3 | 飾品店 (Accessory Shop) | 💍 | 飾品強化成功率 +0.5%~+2.5% | Scroll(Acc)+Gold | +0.5% | +2.5% |
| 4 | 監獄 (Prison) | ⛓️ | EXP 獲得量 +1%~+5% | Gold | +1% | +5% |
| 5 | 金庫 (Gold Vault) | 🪙 | 金幣獲得量 +1%~+5% | Gold | +1% | +5% |
| 6 | 礦坑 (Mine) | 💎 | 自動生產龍之鑽石 | Dragon Diamonds+Gold | 1/pull | 10/pull |
| 7 | 訓練場 (Training Grounds) | ⚔️ | 近距離傷害+2、近距離命中+2 per LV | Scroll(W)+Bless(W)+Gold | +2 atk/+2 hit | +10 atk/+10 hit |
| 8 | 射擊場 (Shooting Range) | 🏹 | 遠距離暴擊率+2%、遠距離暴擊傷害+2% per LV | Scroll(W)+Bless(W)+Gold | +2% crit/+2% dmg | +10% crit/+10% dmg |
| 9 | 狩獵小屋 (Hunting Lodge) | 🐉 | 遠距離傷害+2、遠距離命中+2 per LV | Scroll(W)+Bless(W)+Gold | +2 atk/+2 hit | +10 atk/+10 hit |
| 10 | 圖書館 (Library) | 📚 | 魔法命中+1、額外魔法點數+1 per LV | Scroll(A)+Bless(A)+Gold | +1 hit/+1 sp | +5 hit/+5 sp |
| 11 | 魔法塔 (Magic Tower) | 🧙 | 魔法暴擊率+1%、魔法傷害+1 per LV | 魔法寶石+藍色藥水+Gold | +1% crit/+1 dmg | +5% crit/+5 dmg |
| 12 | 魔法練習場 (Magic Practice) | 🪄 | MP恢復量+2%、魔法暴擊傷害+2% per LV | 魔法寶石+藍色藥水+Gold | +2% regen/+2% dmg | +10% regen/+10% dmg |
| 13 | 農場 (Farm) | 🌲 | HP恢復速度+2%、藥水恢復量+1% per LV | 白色藥水+Gold | +2% regen/+1% heal | +10% regen/+5% heal |
| 14 | 練兵場 (Drill Ground) | 🪖 | 移動速度+2%、迴避率+1% per LV | 席林結晶+Gold | +2% spd/+1% dodge | +10% spd/+5% dodge |
| 15 | 神殿 (Temple) | ⛪ | 魔法防禦力+2、各屬性防禦力+1 per LV | 席林結晶+Gold | +2 MR/+1 elem | +10 MR/+5 elem |

> **Note:** 金庫 (Gold Vault) 原名 Treasure Vault，現已拆分為金庫（金幣加成）與礦坑（龍鑽生產）。

---

## 3. Upgrade Costs Detail

### 3.1 武器工坊 (Weapon Workshop)

| LV | 武器強化成功率 | Scroll(W) | Bless(W) | Gold | Time |
|---|---|---|---|---|---|
| 1 | +0.5% | 100 | 1 | 1,000,000 | 1hr |
| 2 | +1.0% | 200 | 2 | 1,000,000 | 6hr |
| 3 | +1.5% | 300 | 3 | 1,000,000 | 12hr |
| 4 | +2.0% | 400 | 4 | 1,000,000 | 18hr |
| 5 | +2.5% | 500 | 5 | 10,000,000 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed + 14,000,000 Gold

### 3.2 防具工坊 (Armor Workshop)

| LV | 盔甲強化成功率 | Scroll(A) | Bless(A) | Gold | Time |
|---|---|---|---|---|---|
| 1 | +0.5% | 100 | 1 | 1,000,000 | 1hr |
| 2 | +1.0% | 200 | 2 | 1,000,000 | 6hr |
| 3 | +1.5% | 300 | 3 | 1,000,000 | 12hr |
| 4 | +2.0% | 400 | 4 | 1,000,000 | 18hr |
| 5 | +2.5% | 500 | 5 | 10,000,000 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed + 14,000,000 Gold

### 3.3 監獄 (Prison)

| LV | EXP+ | Gold Cost | Time |
|---|---|---|---|
| 1 | +1% | 1,000,000 | 1hr |
| 2 | +2% | 2,000,000 | 6hr |
| 3 | +3% | 3,000,000 | 12hr |
| 4 | +4% | 4,000,000 | 18hr |
| 5 | +5% | 10,000,000 | 24hr |

### 3.4 金庫 (Gold Vault)

| LV | Gold+ | Gold Cost | Time |
|---|---|---|---|
| 1 | +1% | 1,000,000 | 1hr |
| 2 | +2% | 2,000,000 | 6hr |
| 3 | +3% | 3,000,000 | 12hr |
| 4 | +4% | 4,000,000 | 18hr |
| 5 | +5% | 10,000,000 | 24hr |

### 3.5 礦坑 (Mine)

| LV | Output/pull | Cost(DD) | Gold | Time |
|---|---|---|---|---|
| 1 | 1 | 1 | 1,000,000 | 1hr |
| 2 | 2 | 5 | 1,000,000 | 6hr |
| 3 | 4 | 12 | 1,000,000 | 12hr |
| 4 | 7 | 25 | 1,000,000 | 18hr |
| 5 | 10 | 50 | 10,000,000 | 24hr |

**Production Rules:**
- **Interval:** every 60 minutes
- **Storage cap:** 24 accumulations max (24 hours worth)
- **Overflow:** stops producing when capped
- **Harvest:** click button, diamonds go to inventory
- **Offline:** continues accumulating (capped at 24)

### 3.6 訓練場 (Training Grounds)

| LV | 近距離傷害 | 近距離命中 | Scroll(W) | Bless(W) | Gold | Time |
|---|---|---|---|---|---|---|
| 1 | +2 | +2 | 100 | 1 | 1,000,000 | 1hr |
| 2 | +4 | +4 | 200 | 2 | 1,000,000 | 6hr |
| 3 | +6 | +6 | 300 | 3 | 1,000,000 | 12hr |
| 4 | +8 | +8 | 400 | 4 | 1,000,000 | 18hr |
| 5 | +10 | +10 | 500 | 5 | 10,000,000 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed + 14,000,000 Gold

### 3.7 射擊場 (Shooting Range)

| LV | 遠距離暴擊率 | 遠距離暴擊傷害 | Scroll(W) | Bless(W) | Gold | Time |
|---|---|---|---|---|---|---|
| 1 | +2% | +2% | 100 | 1 | 1,000,000 | 1hr |
| 2 | +4% | +4% | 200 | 2 | 1,000,000 | 6hr |
| 3 | +6% | +6% | 300 | 3 | 1,000,000 | 12hr |
| 4 | +8% | +8% | 400 | 4 | 1,000,000 | 18hr |
| 5 | +10% | +10% | 500 | 5 | 10,000,000 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed + 14,000,000 Gold

### 3.8 狩獵小屋 (Hunting Lodge)

| LV | 遠距離傷害 | 遠距離命中 | Scroll(W) | Bless(W) | Gold | Time |
|---|---|---|---|---|---|---|
| 1 | +2 | +2 | 100 | 1 | 1,000,000 | 1hr |
| 2 | +4 | +4 | 200 | 2 | 1,000,000 | 6hr |
| 3 | +6 | +6 | 300 | 3 | 1,000,000 | 12hr |
| 4 | +8 | +8 | 400 | 4 | 1,000,000 | 18hr |
| 5 | +10 | +10 | 500 | 5 | 10,000,000 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed + 14,000,000 Gold

> **Note:** 原設計消耗席林結晶，現改為與訓練場/射擊場相同的 Scroll(W)+Bless(W) 消耗。

### 3.9 圖書館 (Library)

| LV | 魔法命中 | 額外魔法點數 | Scroll(A) | Bless(A) | Gold | Time |
|---|---|---|---|---|---|---|
| 1 | +1 | +1 | 100 | 1 | 1,000,000 | 1hr |
| 2 | +2 | +2 | 200 | 2 | 1,000,000 | 6hr |
| 3 | +3 | +3 | 300 | 3 | 1,000,000 | 12hr |
| 4 | +4 | +4 | 400 | 4 | 1,000,000 | 18hr |
| 5 | +5 | +5 | 500 | 5 | 10,000,000 | 24hr |

**Total:** 1500 Scrolls + 15 Blessed + 14,000,000 Gold

> **Note:** 原設計為魔法防禦力+各屬性防禦力，現改為魔法命中+額外魔法點數。

### 3.10 魔法塔 (Magic Tower)

| LV | 魔法暴擊率 | 魔法傷害 | 魔法寶石 | 藍色藥水 | Gold | Time |
|---|---|---|---|---|---|---|
| 1 | +1% | +1 | 100 | 100 | 1,000,000 | 1hr |
| 2 | +2% | +2 | 200 | 200 | 1,000,000 | 6hr |
| 3 | +3% | +3 | 300 | 300 | 1,000,000 | 12hr |
| 4 | +4% | +4 | 400 | 400 | 1,000,000 | 18hr |
| 5 | +5% | +5 | 500 | 500 | 10,000,000 | 24hr |

**Total:** 1500 魔法寶石 + 1500 藍色藥水 + 14,000,000 Gold

> **Note:** 原設計為 MP恢復+魔法傷害，現改為魔法暴擊率+魔法傷害。

### 3.11 魔法練習場 (Magic Practice)

| LV | MP恢復量 | 魔法暴擊傷害 | 魔法寶石 | 藍色藥水 | Gold | Time |
|---|---|---|---|---|---|---|
| 1 | +2% | +2% | 100 | 100 | 1,000,000 | 1hr |
| 2 | +4% | +4% | 200 | 200 | 1,000,000 | 6hr |
| 3 | +6% | +6% | 300 | 300 | 1,000,000 | 12hr |
| 4 | +8% | +8% | 400 | 400 | 1,000,000 | 18hr |
| 5 | +10% | +10% | 500 | 500 | 10,000,000 | 24hr |

**Total:** 1500 魔法寶石 + 1500 藍色藥水 + 14,000,000 Gold

### 3.12 農場 (Farm)

| LV | HP恢復速度 | 藥水恢復量 | 白色藥水 | Gold | Time |
|---|---|---|---|---|---|
| 1 | +2% | +1% | 100 | 1,000,000 | 1hr |
| 2 | +4% | +2% | 200 | 1,000,000 | 6hr |
| 3 | +6% | +3% | 300 | 1,000,000 | 12hr |
| 4 | +8% | +4% | 400 | 1,000,000 | 18hr |
| 5 | +10% | +5% | 500 | 10,000,000 | 24hr |

**Total:** 1500 白色藥水 + 14,000,000 Gold

> **Note:** 原設計僅 HP恢復速度，現新增藥水恢復量加成。

### 3.13 練兵場 (Drill Ground)

| LV | 移動速度 | 迴避率 | 席林結晶 | Gold | Time |
|---|---|---|---|---|---|
| 1 | +2% | +1% | 10 | 1,000,000 | 1hr |
| 2 | +4% | +2% | 20 | 1,000,000 | 6hr |
| 3 | +6% | +3% | 30 | 1,000,000 | 12hr |
| 4 | +8% | +4% | 40 | 1,000,000 | 18hr |
| 5 | +10% | +5% | 50 | 10,000,000 | 24hr |

**Total:** 150 席林結晶 + 14,000,000 Gold

### 3.14 神殿 (Temple)

| LV | 魔法防禦力 | 各屬性防禦力 | 席林結晶 | Gold | Time |
|---|---|---|---|---|---|
| 1 | +2 | +1 | 10 | 1,000,000 | 1hr |
| 2 | +4 | +2 | 20 | 1,000,000 | 6hr |
| 3 | +6 | +3 | 30 | 1,000,000 | 12hr |
| 4 | +8 | +4 | 40 | 1,000,000 | 18hr |
| 5 | +10 | +5 | 50 | 10,000,000 | 24hr |

**Total:** 150 席林結晶 + 14,000,000 Gold

### 3.15 飾品店 (Accessory Shop)

| LV | 飾品強化成功率 | Scroll(Acc) | Gold | Time |
|---|---|---|---|---|
| 1 | +0.5% | 10 | 1,000,000 | 1hr |
| 2 | +1.0% | 20 | 1,000,000 | 6hr |
| 3 | +1.5% | 30 | 1,000,000 | 12hr |
| 4 | +2.0% | 40 | 1,000,000 | 18hr |
| 5 | +2.5% | 50 | 10,000,000 | 24hr |

**Total:** 150 Scroll(Acc) + 14,000,000 Gold

---

## 4. Upgrade System

### 4.1 Upgrade Workflow

All fifteen buildings use the same upgrade workflow.

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
| Weapon Workshop | `level++`, `constructionStart=0`, `constructionEnd=0`, enchant bonus | — |
| Armor Workshop | `level++`, `constructionStart=0`, `constructionEnd=0`, enchant bonus | — |
| Prison | `level++`, `constructionStart=0`, `constructionEnd=0`, EXP bonus | — |
| Gold Vault | `level++`, `constructionStart=0`, `constructionEnd=0`, Gold bonus | — |
| Mine | `level++`, `constructionStart=0`, `constructionEnd=0`, production rate | `accumulated`, `lastHarvestTime` |
| Training Grounds | `level++`, `constructionStart=0`, `constructionEnd=0`, atk/hit bonus | — |
| Shooting Range | `level++`, `constructionStart=0`, `constructionEnd=0`, crit bonus | — |
| Hunting Lodge | `level++`, `constructionStart=0`, `constructionEnd=0`, ranged atk/hit bonus | — |
| Library | `level++`, `constructionStart=0`, `constructionEnd=0`, magic hit/sp bonus | — |
| Magic Tower | `level++`, `constructionStart=0`, `constructionEnd=0`, magic crit/dmg bonus | — |
| Magic Practice | `level++`, `constructionStart=0`, `constructionEnd=0`, MP regen/crit dmg bonus | — |
| Farm | `level++`, `constructionStart=0`, `constructionEnd=0`, HP regen/potion heal bonus | — |
| Drill Ground | `level++`, `constructionStart=0`, `constructionEnd=0`, move speed/dodge bonus | — |
| Temple | `level++`, `constructionStart=0`, `constructionEnd=0`, MR/elem bonus | — |
| Accessory Shop | `level++`, `constructionStart=0`, `constructionEnd=0`, enchant bonus | — |

> **Mine special rule:** Only future production uses the upgraded production rate. Accumulated treasure and last harvest time are preserved.

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
| **Building Effects** | All bonuses immediately become inactive (Weapon, Armor, Prison EXP, Gold Vault, etc.) |
| **Mine** | Production immediately stops. No offline production. Existing accumulated treasure remains unchanged. Players may not harvest. |
| **Acceleration** | Accelerate button disabled. Dragon Diamonds cannot be used. |
| **Save** | `saveGame()` must be called immediately |

### 7.2 Castle Reclaimed

When the clan captures any castle again:

| Category | Behavior |
|----------|----------|
| **Buildings** | All previous building levels remain unchanged. Data restored from clan save. |
| **Construction** | Cancelled construction does **NOT** resume. Players must manually start the upgrade again. |
| **Mine** | Production resumes using current building level, starting from current server time. Lost production time is NOT recovered. |
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

The Butler panel renders building cards directly in the NPC dialog:

```
┌─────────────────────────────────────────────┐
│  🏰 城堡建築管理 — 管家                       │
│  [📖 建築收藏冊]                             │
├─────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 🔨 LV1  │ │ 🛡️ LV0  │ │ ⛓️ LV2  │  ...  │
│  │ +0.5%   │ │ 未建造  │ │ +2%    │       │
│  │ [升級]  │ │ [建造]  │ │ [升級]  │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 🪙 LV3  │ │ 💎 LV1  │ │ ⚔️ LV0  │  ...  │
│  │ +3%     │ │ 1/pull  │ │ 未建造  │       │
│  │ [升級]  │ │ [採收]  │ │ [建造]  │       │
│  └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────┘
```

Each card shows:
- Icon (color by level)
- Name + LV
- Effect value
- Action button (Upgrade / Build / Harvest / MAX)
- Mine: red badge + HARVEST button when accumulated > 0

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

A 5th collection book alongside equip/misc/card/relic. **75 items total** (15 buildings × 5 levels).

| Aspect | Detail |
|--------|--------|
| **Registration** | Auto-registered when building reaches each level. Key format: `weaponShop_lv3`. Stored in clan state (shared by all members). |
| **Full Collection Reward** | Title: **Great Castle Lord**. All building effects +1% extra. Example: LV5 Weapon Shop +2.5% becomes +3.5%. |
| **UI** | 15×5 grid of building icons. Collected: full color. Uncollected: gray silhouette. |

---

## 11. Effect Integration Hooks

| Building | Hook Location | Implementation |
|----------|---------------|----------------|
| **Weapon Workshop** | Weapon enchant success rate calculation | Add `getCastleBuildingEffect(weaponShop)` to base rate |
| **Armor Workshop** | Armor enchant success rate calculation | Same pattern as weapon shop |
| **Accessory Shop** | Accessory enchant success rate calculation | Same pattern as weapon shop |
| **Prison** | `js/05-kill-progression.js` (EXP calculation) | `exp = Math.floor(exp * (1 + bonus/100))` |
| **Gold Vault** | `js/05-kill-progression.js` (Gold calculation) | `gold = Math.floor(gold * (1 + bonus/100))` |
| **Mine** | No external hook needed | Self-contained production system |
| **Training Grounds** | Player stat calculation | Add melee atk/hit bonus to base stats |
| **Shooting Range** | Ranged crit calculation | Add ranged crit rate/dmg bonus |
| **Hunting Lodge** | Player stat calculation | Add ranged atk/hit bonus to base stats |
| **Library** | Player magic stat calculation | Add magic hit/sp bonus |
| **Magic Tower** | Magic crit rate/dmg calculation | Add magic crit rate% and magic dmg bonus |
| **Magic Practice** | MP regen / magic crit dmg calculation | Add MP regen% and magic crit dmg% bonus |
| **Farm** | HP regen / potion heal calculation | Add HP regen% and potion heal% bonus |
| **Drill Ground** | Move speed / dodge calculation | Add move speed% and dodge% bonus |
| **Temple** | Player defense calculation | Add MR/elem defense bonus |

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
- 有 DOM

### 12.4 Data Structure

```javascript
// Stored in st.modes[mode].castleBuildings
{
  weaponShop: {
    level: 0,               // 0–5 (0 = not built)
    constructionStart: 0,   // timestamp or 0
    constructionEnd: 0,     // timestamp or 0
    targetLevel: null       // level being constructed to
  },
  armorShop: { /* same structure */ },
  prison: { /* same structure */ },
  goldVault: { /* same structure */ },
  treasure: {
    level: 0,
    constructionStart: 0,
    constructionEnd: 0,
    targetLevel: null,
    accumulated: 0,         // diamonds waiting to be harvested
    lastHarvestTime: 0      // timestamp of last harvest
  },
  trainingGrounds: { /* same structure */ },
  shootingRange: { /* same structure */ },
  huntingLodge: { /* same structure */ },
  library: { /* same structure */ },
  magicTower: { /* same structure */ },
  magicPractice: { /* same structure */ },
  farm: { /* same structure */ },
  drillGround: { /* same structure */ },
  temple: { /* same structure */ },
  accessoryShop: { /* same structure */ }
}
```

---

## 13. Data Migration

### 13.1 From v0 (no castle buildings) to v1

When `_clanNormalizeState()` detects that `castleBuildings` is missing from `st.modes[mode]`, it should inject the default structure (all buildings at level 0).

### 13.2 From v1 to v2 (adding new buildings)

When new buildings (magicPractice, drillGround) are added, `_clanNormalizeState()` should detect missing building keys and inject their default structure without affecting existing buildings.

---

## 14. Permissions

| Action | Required Role |
|--------|---------------|
| View buildings | Any clan member |
| Build / Upgrade | Royal clan leader |
| Accelerate | Royal clan leader |
| Harvest Mine | Royal clan leader |
| View Collection Album | Any clan member |

---

## 15. Icon and Visual Style

| Building | Emoji | Card Color |
|----------|-------|------------|
| 武器工坊 | 🔨 | Red |
| 防具工坊 | 🛡️ | Blue |
| 飾品店 | 💍 | Purple |
| 監獄 | ⛓️ | Gray |
| 金庫 | 🪙 | Gold |
| 礦坑 | 💎 | Cyan |
| 訓練場 | ⚔️ | Orange |
| 射擊場 | 🏹 | Green |
| 狩獵小屋 | 🐉 | Dark Green |
| 圖書館 | 📚 | Brown |
| 魔法塔 | 🧙 | Purple |
| 魔法練習場 | 🪄 | Magenta |
| 農場 | 🌲 | Light Green |
| 練兵場 | 🪖 | Olive |
| 神殿 | ⛪ | White |

---

## 16. Future Ideas (Not In Scope)

- **Building destruction:** Enemy clans can sabotage buildings during siege.
- **Building-specific quests:** Each building offers daily quests for bonus materials.
- **Clan hall expansion:** More building slots unlocked by clan hall level.
- **Building skins:** Cosmetic upgrades for buildings.
- **Specialization:** Choose between two upgrade paths per building.

---

## Appendix: Referenced Game Systems

| System | File | Purpose |
|--------|------|---------|
| Clan State | `js/25-clan-system.js` | `st.modes[mode]` contains `castleBuildings` |
| Siege Victory | `js/25-clan-system.js` | `siegeVictoryActive()` checks castle ownership |
| NPC System | `js/11-world-map.js` | Butler NPC placement in castle towns |
| Collection Book | `js/18-misc-book.js` | Building collection album integration |
| EXP/Gold | `js/05-kill-progression.js` | Prison and Gold Vault effect hooks |
| Save System | `js/00-data.js` | `saveGame()` / `_saveWrapPortable()` / SIG1 signing |
| Plugin System | `scripts/afk-plugin-block.html` | Plugin injection point |
| Core Patches | `scripts/apply-core-patches.mjs` | Anchor-based core patching |
