# 依隊伍人數增加怪物格數 — 實作計畫

## 需求
- 1~5 人組隊：維持 5 組怪物（同現狀）
- 6 人組隊：6 組怪物
- 7 人組隊：7 組怪物
- 8 人組隊：8 組怪物
- 寵物、衛兵、召喚物不受影響
- 地圖上的 BOSS 限制不變（每張圖可同時存在的 BOSS 數量同現狀）
- 攻城戰也套用相同規則

## 核心函式
寫在 js/03-combat-core.js（backSlotsActive 定義附近）

```
function monsterSlotCount() {
    if (!backSlotsActive()) return 3;          // 純 BOSS 房→3 格
    let ps = (typeof partyActiveMemberCount === 'function')
             ? partyActiveMemberCount() : 1;   // 隊伍人數 1~8
    return Math.max(5, Math.min(8, ps));       // 1~5人→5, 6人→6, 7人→7, 8人→8
}
```

## 修改檔案一覽

### 1. js/03-combat-core.js

**Line 540**: spawnAt 初始化改動態長度
原本: if(!mapState.spawnAt) mapState.spawnAt = [null, null, null, null, null];
改成:
  if(!mapState.spawnAt || mapState.spawnAt.length < monsterSlotCount()) {
      let n = monsterSlotCount();
      mapState.spawnAt = new Array(n).fill(null);
  }

**Line 549**: slotCount 改用 monsterSlotCount()
原本: let slotCount = backSlotsActive() ? 5 : 3;
改成: let slotCount = monsterSlotCount();

### 2. js/09-vfx-render.js

**Line 1241-1242**: _order 陣列改依動態格數
原本: let _back = backSlotsActive(); let _order = _back ? [0,1,2,3,4] : [0,1,2];
改成:
  let _nSlots = (typeof monsterSlotCount === 'function') ? monsterSlotCount() : (backSlotsActive() ? 5 : 3);
  let _order = Array.from({length: _nSlots}, (_, i) => i);

**Line 1246**: _rowCls 規則不變（i>=3 都是 .mob-back）

### 3. js/11-world-map.js

**Line 1522-1523**: mobs/spawnAt 改動態長度（進地圖時）
原本: mapState.mobs = [null,null,null,null,null]; mapState.spawnAt = [null,null,null,null,null];
改成:
  let _n = typeof monsterSlotCount === 'function' ? monsterSlotCount() : 5;
  mapState.mobs = new Array(_n).fill(null);
  mapState.spawnAt = new Array(_n).fill(null);

### 4. js/25-clan-system.js

**Line 1244**: 血盟團戰填怪
原本: let slots = typeof backSlotsActive === 'function' && backSlotsActive() ? 5 : 3;
改成: let slots = typeof monsterSlotCount === 'function' ? monsterSlotCount() : (typeof backSlotsActive === 'function' && backSlotsActive() ? 5 : 3);

**Line 1309**: 團戰結束重置 spawnAt
原本: mapState.spawnAt = [null,null,null,null,null];
改成:
  let _n = typeof monsterSlotCount === 'function' ? monsterSlotCount() : 5;
  mapState.spawnAt = new Array(_n).fill(null);

### 5. js/26-world-channel.js

**Line 2046**: 世界頻圍毆戰重置 spawnAt
原本: mapState.spawnAt = [null,null,null,null,null];
改成:
  let _n = typeof monsterSlotCount === 'function' ? monsterSlotCount() : 5;
  mapState.spawnAt = new Array(_n).fill(null);

**Line 2071**: 世界頻圍毆戰填怪
原本: let slots = typeof backSlotsActive === 'function' && backSlotsActive() ? 5 : 3;
改成: let slots = typeof monsterSlotCount === 'function' ? monsterSlotCount() : (typeof backSlotsActive === 'function' && backSlotsActive() ? 5 : 3);

### 6. js/30-siege-v2.js

**Lines 383-386**: fillStage() 的硬編碼 5 全部改動態
原本: if (!Array.isArray(mapState.mobs)) mapState.mobs = [null,null,null,null,null];
      if (!Array.isArray(mapState.spawnAt)) mapState.spawnAt = [null,null,null,null,null];
      while (mapState.mobs.length < 5) mapState.mobs.push(null);
      while (mapState.spawnAt.length < 5) mapState.spawnAt.push(null);
      for (let i = 0; i < 5; i++) {
改成:
  let _n = typeof monsterSlotCount === 'function' ? monsterSlotCount() : 5;
  if (!Array.isArray(mapState.mobs)) mapState.mobs = new Array(_n).fill(null);
  if (!Array.isArray(mapState.spawnAt)) mapState.spawnAt = new Array(_n).fill(null);
  while (mapState.mobs.length < _n) mapState.mobs.push(null);
  while (mapState.spawnAt.length < _n) mapState.spawnAt.push(null);
  for (let i = 0; i < _n; i++) {

## 不影響的項目（無需修改）

- 純 BOSS 房（三龍窟/聖地）：backSlotsActive()=false → 維持 3 格
- 雙 BOSS 祭壇（底比斯歐西里斯）：KING_ROOMS.dual → backSlotsActive()=false
- 軍王之室：走獨立 KING_ROOMS 邏輯，不受 slotCount 影響
- 攻城 type:'target' 階段：spawnForStage() 只在 idx===1 生出目標
- 寵物系統（js/22-pets.js）：獨立系統
- 召喚物系統（js/23-summons.js）：獨立系統
- 城門守衛（js/31-castle-guards.js）：獨立系統
- 離線補跑（afk-offline.js）：已用 mapState.spawnAt.length 泛化讀取

---
備註：實作時要注意 monsterSlotCount() 定義在 js/03-combat-core.js，而 partyActiveMemberCount() 定義在 js/05-kill-progression.js（較晚載入），
但 monsterSlotCount() 只在 runtime 被呼叫（所有 js 已載入完畢），使用時用 typeof 檢查即可安全呼叫。
