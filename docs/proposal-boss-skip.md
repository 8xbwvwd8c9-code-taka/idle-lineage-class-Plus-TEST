# 跳過指定 BOSS —— 純外掛做得到,做法是「出怪前把牠從怪物池濾掉」

> **狀態：已實作**（2026-08-04）—— 見 `afk-bossskip.js`。本文保留為設計依據；
> 實作與本文的差異：①「濾完 normalPool 變空」的保險改成「濾完整個池變空」（只移除 BOSS 的話 normalPool 不可能縮水，
> 真正會出不了怪的是純 BOSS 池被清空）②地圖排除多加 `pride_f*`（攀登樓層）與遺忘之島兩張圖，
> 但**不排除** `HIDDEN_AREA_PARENT`（隱藏區域是手動施法進入、與 BOSS 無關）③面板的「出沒地」改先問
> `_CARD_MAP_NAMES`（`mapDisplayName` 收不到隱藏區域與風木地監，那幾隻會整欄空白）。

一句話結論:**這是「上游『迴避頭目』的細緻版」**——上游只給一個「全部頭目都躲」的勾選框(要燒瞬移卷軸、還會把整個戰場清空),
玩家要的是「只躲那幾隻」。純外掛可做,掛點是核心 `spawnMob`(頂層具名函式,`afk-training.js:371` 已有包住它的先例),
做法是**在原函式跑之前把 `DB.maps[目前地圖]` 換成濾掉指定 BOSS 的副本、`finally` 換回來**,
線上與離線自動一致(離線結算走的就是同一支核心 `spawnMob`/`maybeSpawnMobs`)。

---

## 1. 需求釐清:三種解讀,推薦 (b)

使用者原話只有「想要新增跳過指定 Boss 這個功能」。先把遊戲實情查清楚再選:

| 解讀 | 遊戲實情對不對得上 | 判斷 |
|---|---|---|
| **(a) 掛機時不打某些 BOSS**（自動戰鬥遇到就跳過不打） | ❌ **做不到、也沒用**。選目標是 `getTarget()`(`js/03-combat-core.js:2225`)自動鎖「最早出生」的活怪;就算改成不鎖 BOSS,**牠還是站在場上、還是會打你**(絕大多數 BOSS `beh:'主動'`),而且佔著一個格位不讓一般怪補位。結果是「不打牠、被牠打死」,比現在更糟 | 淘汰 |
| **(b) 指定的 BOSS 不要出現**（玩家勾選黑名單,勾了的就不刷出來） | ✅ **對得上**。野外 BOSS 是「每次出怪擲骰」出來的(`js/03-combat-core.js:2007`,預設 1%),不是定點挑戰、也不是副本門檻 → 只要在抽選前把牠從池子拿掉,牠就不存在 | **推薦** |
| **(c) 不打贏也能進下一關** | ❌ **不該做**。真正「BOSS＝關卡門」的只有軍王之室(`_kbVictory`)、傲慢之塔攀登(`state._prideAdvance`)、遺忘之島(`state._oblivionAdvance`)、安塔瑞斯巢穴(`state._antAdvance`)這四類(`js/05-kill-progression.js:597-603`),跳過等於直接發進度。而且那幾張圖的怪物池**只有 BOSS**,濾掉會出不了怪 | 淘汰,並且要當成「不可跳的地圖」明確擋掉 |

**為什麼 (b) 才是玩家真正要的**:上游其實已經有這個需求的粗版——設定面板的
「迴避頭目(瞬移卷軸)」勾選框(`index.html:448`,id `set-teleport`),邏輯在 `js/07-skills-cast.js:1041-1057`:
場上出現任何 `boss && !noAutoTeleport` 就自動用(沒有就自動買)一張瞬移卷軸。
它的三個缺點正好就是玩家會提這個需求的原因:

1. **全有全無**——想躲巴風特,連順手能打的飛龍一起躲掉。
2. **要錢**——每躲一次一張瞬移卷軸(缺貨自動買,`js/07-skills-cast.js:1048-1053`)。
3. **會清場**——`doTeleport()`(`js/02-stats-recompute.js:1081-1091`)把 `mapState.mobs` 五格整個清空重排,
   打到一半的怪全丟掉(注意:它**不換地圖**,只是清場重刷)。

本提案的 (b) 三個缺點都沒有:指定的那隻根本不會被抽中,不燒卷軸、不清場、離線也同樣有效。

---

## 2. 遊戲實情(查過的 code)

### 2.1 BOSS 是怎麼標記的、怎麼出來的

- 標記就是怪物資料上的 `boss: true`(`js/00-data.js`,例:`baphomet` 2142、`wyvern` 2139、`antaras` 2148)。
- 出怪唯一的一般路徑是 `spawnMob(idx)`(`js/03-combat-core.js:1955`),第一行就是
  `let pool = DB.maps[mapState.current];`(`:1957`)——**整支函式的怪物來源只有這一個 pool 變數**,
  下面拆成 `bossPool` / `normalPool`(`:1991-1992`)。
- 出王機率:`_normalBossChance`(`:2006`)＝`player.d.bossEncounterPct / 100`,**預設 1%**
  (遺物「山羊惡魔的雙足」`js/00-data.js:951` 會改成 3%);長老之室固定 5%、攻城區 10%。
- 抽中王之後還有「場上同名 BOSS 只能一隻」的限制(`:2010-2014`),抽不到不同名的就退回一般怪。
- **`bossPool` 空的時候 `wantBoss` 直接是 false**(`:2007` 有 `bossPool.length > 0`),
  然後走一般怪分支(`:2016-2023`)——這正是「濾掉池子」這招能成立的原因:核心自己就處理了「這張圖沒有王」的情況。
- 出怪排程在 `maybeSpawnMobs()`(`js/03-combat-core.js:538`,是我方**核心補丁 1** 抽出來的具名函式),
  它只負責「什麼時候補格」,實際抽怪還是呼叫 `spawnMob`。

### 2.2 不走 pool 的 BOSS 路徑(這些跳不掉,也不該跳)

| 路徑 | 位置 | 說明 |
|---|---|---|
| 軍王之室/雙BOSS祭壇 | `KING_ROOMS`(`js/03-combat-core.js:967`)、`spawnMob` `:1977-1988` | 中央固定 BOSS,擊敗＝過關傳送 |
| 安塔瑞斯巢穴 | `ANTHARAS_AREA_BOSS`(`js/05-kill-progression.js:832`)、`spawnMob` `:1961-1975` | 副本區域頭目,擊敗＝推進下一區 |
| 純 BOSS 房 | `PURE_BOSS_MAPS`(`js/03-combat-core.js:977`,三龍窟/聖地/崩壞廳等 11 張) | 只生中央格,BOSS 就是全部內容 |
| 攻城 | `isSiegeArea()`、城門/守護塔(`js/00-data.js:1942-1947`,`siegeEnemy` 且 `boss:true`) | 攻城目標本身 |
| 時空裂痕 | `spawnRiftMob`(`js/03-combat-core.js:1956` 早退、`js/05-kill-progression.js:1319`) | 自訂動態出怪,不讀 `DB.maps` |
| 條件觸發 | 卡瑞 `:2092-2098`(帶四樣道具·龍之谷地監6樓 1%)、林德拜爾 `:2106-2113`(帶幼龍蛋·任一野外 1%) | 直接指定 `mobId`,不經 `bossPool`——**濾池擋不到**,但這兩隻都是玩家自己帶道具去換的,不列入清單即可 |
| 三段變身 | `transformTo`(`js/05-kill-progression.js:288-296` `doMobTransform`、變身階 id 集合 `js/05:1318` `_TRANSFORM_STAGE_IDS`) | 全遊戲只有兩條鏈(玉藻→九尾→殺生石、被侵蝕的安塔瑞斯三階),**逐一驗過:六隻全部 `boss:true`,沒有「一般怪變成 BOSS」的情況** → 濾掉第一階就整鏈不會出現;後面幾階不該列進清單(牠們本來就不從池子出) |

### 2.3 數量級(直接跑 `DB` 數出來的,不是估計)

- 怪物池裡出現過的 BOSS **73 種**;`boss:true` 的怪物總共 83 隻(差額就是變身後段階與副本專屬)。
- 有 BOSS 的地圖 **154 張**;每張圖的 BOSS 數**中位數 1、最多 8**。
- **把 BOSS 全部濾掉會變成「沒有任何怪可出」的地圖有 17 張**:
  `kent_outer/inner`、`ww_outer/inner`、`heine_outer/inner`(攻城)、四間軍王之室、`thebes_temple`、`tikal_altar`、
  `cursed_dark_elf_sanctuary`、`collapsed_elder_council_hall`、三龍窟。
  **這 17 張正好全部落在下面的地圖排除清單內**,但仍要留「濾完沒有一般怪就不濾」這道保險(上游會加新圖)。
- 池子裡帶 `noAutoTeleport` 的只有「往上層的樓梯」與「遺忘之島」兩個轉場建築。

### 2.4 離線結算怎麼跑的(這題一定會踩到)

`afk-offline.js` 是我方自製的整套離線結算,關鍵是**它的怪從哪來**:

- 快速段每一步 `fastEventStep()`(`afk-offline.js:975`)第一行就是 `maybeSpawnMobs()`(`:977`),
  BOSS 秒殺補小怪時直接 `spawnMob(idx)`(`:966`)。
- 全模擬段直接跑核心 `tick()`(`:1214`),出怪同樣經 `maybeSpawnMobs()`。

→ **結論:只要把 wrapper 掛在 `spawnMob` 上,離線自動就一致,不必在 afk-offline 另外做一份。**
這一點很重要:離線那邊「迴避頭目」是另外用 `fastTeleportAwayBoss()`(`afk-offline.js:916-940`)
1:1 重放線上邏輯的——**因為它掛在 `autoActions`,而快速段不跑 `autoActions`**(`docs/offline.md` 有寫)。
本提案掛在出怪端,不吃這個坑。

順帶:`afk-offline.js:1161-1168` 有一段「BOSS 沒被 killMob 就離開場上 → 不記統計」的防護
(避免把瞬移逃走誤記成「安全秒殺」,踩過 3h 秒殺 188 隻死亡騎士)。本提案的 BOSS **根本不會生成**,
不會進 `bossStats`,也不會觸發這條路徑——比「瞬移逃離」乾淨。

### 2.5 現有外掛掃過一遍,沒有重造輪子

| 外掛 | 在做什麼 | 跟這題的關係 |
|---|---|---|
| `afk-bossring.js` | 傳送控制戒指「自動找 BOSS」:場上沒王就自動用瞬移卷軸召一隻 | **方向相反,而且會打架**——見 §5.4。它的 `mapHasBossPool()`(`:122-124`)要跟著改 |
| `afk-mercguard.js` | 傭兵招募被擋下時跳彈窗 | 無關 |
| `afk-retrial.js` | 試煉批次兌換 | 無關(試煉道具掉落不綁 BOSS) |
| `afk-training.js` | 木人場;**已經包了 `window.spawnMob`**(`:370-373`)讓木人場不自動出怪 | **重要先例**:證明 `spawnMob` 包得住。兩支都是 wrapper,疊起來沒問題;木人場地圖 `afk_dummy` 不在 `DB.maps` 內,本外掛不會動它 |
| `afk-npclist.js` / `afk-mobname.js` | 村莊 NPC 條列、怪物名字顯示 | 無關(純顯示層) |

沒有任何一支已經在做「控制出什麼怪」,不會重複。

---

## 3. 可行性結論

**純外掛可做,不需要新的核心補丁。**

掛點與寫法:

```js
// afk-bossskip.js（示意，不是最終碼）
var _origSpawnMob = window.spawnMob;
window.spawnMob = function (idx) {
    if (!_skipActive()) return _origSpawnMob.apply(this, arguments);   // 開關關掉/清單空 → 透明放行
    var cur = (typeof mapState !== 'undefined' && mapState) ? mapState.current : '';
    var pool = _filteredPool(cur);            // 快取:同一張圖 + 同一份清單只算一次
    if (!pool) return _origSpawnMob.apply(this, arguments);            // 這張圖不濾 / 濾了會壞
    var orig = DB.maps[cur];
    DB.maps[cur] = pool;
    try { return _origSpawnMob.apply(this, arguments); }
    finally { DB.maps[cur] = orig; }          // 一定要還原:DB.maps 是共用資料
};
```

**為什麼是「換池子」而不是「生完再拿掉」**:`spawnMob` 生完怪之後已經做了一串副作用——
`uid()`、`_born` 出生序遞增(`:2134`)、席琳強化 `applySherineBuff`、硬皮 `initHardSkin`、
BOSS 出場特效與螢幕震動 `vfxBossEntrance`(`:2206`)。事後刪掉要一一還原,漏一個就是安靜的髒狀態;
**在抽選之前換池子則是零副作用**——核心自己就會走「這張圖沒有王」那條既有分支。

**為什麼安全**:`spawnMob` 全程同步,`pool` 只在第 1957 行讀一次(下面 `:2084` 讀 `DB.maps` 是判斷追蹤怪在不在池裡,
而追蹤怪本來就排除 BOSS `:2085` → 濾掉 BOSS 不影響);`finally` 內還原,任何路徑都不會把濾過的池留在 `DB` 上。

⚠️ **`DB` 是 `const DB`(js/00)、`mapState`/`player` 也是 `let`,都不在 `window` 上**——
一律用裸名 + `typeof X !== 'undefined'` 存取,寫 `window.DB` 會拿到 undefined 而整段安靜不生效(afk-anyclass/afk-locksafe 都踩過)。

---

## 4. 具體設計

### 4.1 檔名與開關

- 檔名:**`afk-bossskip.js`**
- 載入順序:放在 `afk-bossring.js` **之前**(bossring 要問它「這張圖還有沒有王可召」)。
  在 `scripts/afk-plugin-block.html` 的 `afk-mercguard.js` 與 `afk-bossring.js` 之間插一行,再同步補進 `index.html`。
- `AFK_TOGGLES.register`:

  | 欄位 | 值 |
  |---|---|
  | `id` | `bossskip` |
  | `name` | `跳過指定頭目` |
  | `desc` | `勾選的頭目不會再出現在野外` |
  | `group` | `自動化` |
  | `def` | 預設開(清單空的時候等於沒作用,零風險) |
  | `parent` | **不設**——見下 |

  **不做子選項的理由**:子項的判準是「父關掉＝子真的失效」。本外掛不依賴 `bossring`(反向依賴)、
  也不依賴 `offline`(離線一致是「掛在核心出怪端」的必然結果,不是讀了 offline 的東西)。
  掛成誰的子項都會製造 CLAUDE.md 明文警告的那種假耦合。

- **id 必須寫進 `afk-toggles.js` 的內建目錄**(檔頭就早退的外掛不寫進去 → 關掉後面板上整項消失 → 開不回來,
  `scripts/check-toggle-deadend.mjs` 會靜態擋)。

### 4.2 清單存哪、什麼結構

| 項目 | 決定 | 理由 |
|---|---|---|
| 儲存 | **`localStorage`** | 它會改變遊戲行為(出什麼怪) → CLAUDE.md 明訂只能 localStorage;`file://` 直開的玩家也要能用 |
| 鍵名 | `afk_bossskip_<slot>` | **依存檔位(角色)分開**,寫法比照 `afk-bossring.js:30` 的 `afk_bossring_on_<slot>`。理由同一條:主力打得贏的王、練功號打不贏,兩隻角色想跳的不一樣 |
| 內容 | `["baphomet","wyvern"]`(怪物 **id** 陣列的 JSON) | 濾池是用 id 比對,精確;認不得的 id 直接忽略(上游改 id 時只是那條失效,不會壞) |
| 大小 | 73 種上限、實際幾個字串 | 對 5MB 的存檔地盤幾乎無感;不需要另找儲存 |

⚠️ **場上已生成的怪只有名字沒有 id**——`mapState.mobs[i]` 是 `{...DB.mobs[id]}` 展開的(`js/03:2134`),
**沒有 `id` 欄位**。要在場上比對(§4.6 的清場)必須另外由 id 集合推一份名字集合。

### 4.3 哪些不可以跳(全部沿用上游自己的旗子,不自己列清單)

四道閘,由粗到細:

1. **地圖層級排除**——這些圖的 BOSS 是內容或關卡門:
   `PURE_BOSS_MAPS`(`js/03:977`)、`KING_ROOMS`(`js/03:967`)、`ANTHARAS_AREA_BOSS` 的四張(`js/05:832`)、
   `isSiegeArea()`、`rift_battle`、`state.prideClimb` / `state.oblivion` / `state.antharas` 進行中、`town_*`。
   (寫法直接抄 `afk-bossring.js:104-119` 的 `excludedMap()`,那支已經逐條踩過。)
2. **怪物層級排除:`DB.mobs[id].noAutoTeleport === true` 一律不可跳**。
   這是**上游自己標的「這隻不該被迴避頭目甩掉」**(`js/00-data.js:2098` 卡瑞、`:2297` 往上層的樓梯、
   `:2372` 遺忘之島傳送門、`:2155-2157` 喀瑪三王)。沿用它而不是自己維護黑名單 —— 作者之後再標新的,我們自動跟上。
3. **變身鏈的非第一階不列**(`_TRANSFORM_STAGE_IDS`,`js/05:1318`):牠們不從池子出,列出來只會讓玩家勾了沒用。
4. **保險:濾完之後 `normalPool` 會變空就整張圖不濾**。第 1~2 條理論上已經涵蓋今天的 17 張圖,
   但上游一路在加新副本 —— 這條是「作者加了新圖、我們還沒跟上」時的安靜失效防線。

### 4.4 UI

**先把按鈕文字定下來:**

- 入口鈕(自動化分頁的「🔌 外掛」列,`#m-afk-navrow`):**`🚫 跳過的頭目`**
- 面板標題:**`🚫 跳過的頭目`**
- 面板底部:**`全部不跳過`**(一鍵清空)
- 每一列:`☐ 巴風特　Lv.61　巴風特神殿`(勾選框＋名字＋等級＋出沒地圖)

**再問「還缺什麼玩家非知道不可」:**

- 面板說明(1 句):**「勾選的頭目不會再出現。」**
- **不可跳的那些直接不列出來**——列出來再解釋為什麼不能勾,就是 CLAUDE.md 點名要刪的那種字。
- **唯一的例外提示**(精通任務,見 §5.2):勾選職業精通頭目且 `player.masteryQuest === 'active'` 時,
  跳一次確認:**「精通任務要打倒<名字>,跳過就拿不到精通之證。」**
  (`MASTERY_DATA[player.cls].boss`,`js/01-drops-config.js:1139`;判定點 `js/05:436`。
  ⚠️ `const MASTERY_DATA`,要裸名 + `typeof`。)
- **不寫**:容量、清單筆數、「這個功能怎麼實作的」、「離線也生效」(玩家不必為此做任何不同的動作)。

**版面**:73 列(每張圖中位數只有 1 隻,但清單是全遊戲的)→ 加一個搜尋框,
**目前所在地圖的頭目置頂**。73 列不需要虛擬捲動(afk-wiki 的 `makeListFilter` 是給幾千列用的,不必動它)。

**掛點**:`#tab-automation`(`index.html:394`,靜態 DOM、不會被重繪洗掉)裡的共用列 `#m-afk-navrow`
(`afk-dex.js:786` / `afk-training.js:908` / `afk-junkmgr.js:316` 都用這個,誰先載入誰建列)。
彈窗用 `AFK_UI.openLayer/closeLayer`(手機返回鍵/ESC 可關)。

### 4.5 離線一致 —— 要,而且是免費的

**決定:離線與線上完全一致。** 理由:離線掛機的核心原則就是「把在線上會發生的掛機照跑一遍」
(`docs/offline.md`)。玩家設了「不要打巴風特」卻在離線被巴風特打死,是最糟的體驗。

**成本:零額外程式碼。** §2.4 查證過:離線快速段與全模擬段的出怪都經過核心 `spawnMob`,
wrapper 掛在那裡兩邊自動吃到。**唯一要做的是別把 wrapper 寫成只在 `!state.ff` 時生效**
(那是 render 類守衛的習慣,這裡反過來——出怪邏輯補跑期間**必須**照樣生效)。

### 4.6 已經站在場上的那隻怎麼辦

濾池只管「未來的出怪」。會出現「已在場上」的情形只有一種:**玩家剛剛把牠勾起來,而牠正站在畫面上**。

處理:**只在清單變更時掃一次**(不放 tick、不放每次出怪),條件全部符合才清:
目前地圖可濾(§4.3 第 1 條)、`m.boss`、`!m._dead`(已死待清算的不能動,會吞掉掉落)、名字在跳過名單裡。
清法照核心 `doTeleport` 的做法:`mapState.mobs[i] = null; mapState.spawnAt[i] = null;` 然後 `renderMobs()`。

不做「每 tick 掃場」的理由:那是每秒 10 次的熱路徑,而它能多解決的情境只有「上游又生出一條不經 pool 的路」——
那種情況本來就該讓它出現(見 §4.3 第 2 條的精神:上游有自己的理由)。

### 4.7 跟 afk-bossring 的互動(必須一起改)

`afk-bossring.js` 的自動找 BOSS 迴圈(`:145-177`)判斷「這張圖有沒有 BOSS 可召」用的是
`mapHasBossPool()`(`:122-124`),直接讀原始的 `DB.maps`。玩家如果把某張圖的王**全部**跳過又開著自動找 BOSS,
會變成:瞬移(扣卷軸)→ `mapState.forceBoss = true` → `spawnMob` 因為 `bossPool` 空而白白消耗掉旗標(`js/03:2008`)
→ 場上還是沒王 → 10 秒後再瞬移一次 → **無限燒卷軸**(這正是 `afk-bossring.js:120-121` 註解裡記過的坑)。

**改法(一行)**:`mapHasBossPool()` 改成問 `window.AFK_BOSSSKIP && AFK_BOSSSKIP.spawnableBossIds(map)`,
拿不到就退回今天的行為(bossskip 被關掉/沒載入 → 完全等同現況)。
依賴方向是 bossring → bossskip 的**可選讀取**,而且降級結果就是今天的行為,不會形成 CLAUDE.md 警告的那種死結。

**要不要讓 `mapState.forceBoss` 繞過濾網?** 不要。玩家的跳過清單優先——他就是不想看到那隻。
戒指強制出王的情境由上面那行 bossring 修正處理;手動用卷軸的極少數情況會白費一張卷軸,不值得為它加一句畫面文字。

### 4.8 效能(這是最容易做壞的地方)

`spawnMob` 在離線結算的 self-time 佔比是 **4.1%**,24 小時結算會被呼叫 **12~16 萬次**。
wrapper 每次多做的事必須是 O(1):

- **濾好的池要快取**:`Map<地圖id, 濾過的陣列>`,清單變更時整個清掉。不可以每次 `filter()`。
- **`AFK_TOGGLES.enabled()` 不可以放在熱路徑上**——它每次都 `localStorage.getItem`(`afk-toggles.js:42`)。
  改成 1 秒快取(比照 `afk-bossring.js:32-41` 的 `_cache`),清單變更時立即失效。
- **最快的早退放最前面**:清單空(絕大多數玩家)→ 第一行就 `return orig(...)`,連地圖判斷都不做。

---

## 5. 副作用與風險

### 5.1 掛機會不會卡在原地空轉

**不會。** 濾掉 BOSS 之後 `wantBoss` 是 false(`js/03:2007`),核心走一般怪分支照樣把格位填滿。
唯一會空轉的是「濾完連一般怪都沒有」的地圖——**已經數出來是 17 張,全部落在地圖排除清單內**(§2.3),
再加 §4.3 第 4 條的保險。

### 5.2 掉落 / 任務 / 成就會不會被卡住

**逐系統查過(不是推測)。結論:職業試煉完全不綁 BOSS;真正會斷的只有下面標 ⚠️ 的兩條。**

| 系統 | 影響 | 判斷 |
|---|---|---|
| BOSS 專屬掉落 | 拿不到。`MOB_DROPS`(`js/01-drops-config.js:1`)是**以怪名為 key**、沒有獨立的「BOSS 掉落表」,`mob.boss` 只影響數值:金幣掉落率 100% vs 70%(`js/05:396`)、**掉的裝備祝福率 10% vs 1%**(`js/08-items-equip.js:123`)、萬能藥 1% vs 0.01%(`js/05:505`)、席琳結晶 10 倍(`js/05:578`) | **預期內**,玩家自己選的 |
| 收集冊 / 圖鑑 | **不受影響**——四本冊子全掛在 `gainItem`(`js/08:100-105`)、是**取得道具**登記制,不是擊殺登記制 | 安全 |
| 卡片收集冊 | 該 BOSS 的卡片掉不到(`js/15-cards.js:180-189`),連帶該地區完成度差一格(`js/15:137-142`) | 可繞:卡片有 `gachaWeight`,潘朵拉抽/買得到 → 只是變慢 |
| 職業試煉(15/30/45/50 級) | **完全不受影響**——把 `TRIAL_Q`(`js/12-npc-quests.js:706-731`)與 `TRIAL_50_CFG`(`:990-1018`)的目標怪逐一比對過,**沒有一隻是 `boss:true`**(黑暗妖精將軍、魔族暗殺團、強盜頭目、艾爾摩將軍…名字像頭目但都沒有旗標) | 安全 |
| 封印之物 / 卡瑞 / 屠龍劍 | **不受影響**——卡瑞不從 `bossPool` 出(帶四樣道具才 1% 觸發,`js/03:2092`),而且帶 `noAutoTeleport` → §4.3 第 2 條直接不列 | 安全 |
| 傲慢之塔攀登 / 遺忘之島 | **不受影響**——兩隻轉場建築(`pride_stairs` / `obli_portal`)都帶 `noAutoTeleport` → 第 2 條不列;攀登/航行中的地圖另外被第 1 條排除 | 安全(雙保險) |
| 軍王之室 / 安塔瑞斯巢穴 / 三龍窟 / 攻城 / 時空裂痕 | **不受影響**——全在地圖排除清單內 | 安全 |
| **精通任務** | ⚠️ **會卡**:接了任務後要打倒職業對應頭目(八個職業全都是**飛龍**,`js/01-drops-config.js:1139` 起)才掉「精通之證」(`js/05:436`)。飛龍住 `dragon_valley` 的一般池、沒有 `noAutoTeleport` → **勾得起來**,而且沒有替代路徑 | 用 §4.4 那句一次性確認處理 |
| **長老之室的 8 隻長老** | ⚠️ **會卡**:`elder_room` 是地圖選單裡的一般狩獵圖(池子 13 隻一般怪 + 8 隻長老 BOSS),而黑暗妖精聖地三張圖的入場券 `item_dk_book` **唯一來源就是長老各 1% 掉落**(`js/01-drops-config.js:152-159`)。全部勾掉 → 三張聖地圖(含吉爾塔斯 → 崩壞的長老會議廳)永久進不去 | **只記在文件、不做特例**,理由見下 |

**為什麼只有精通任務做確認、長老不做**:判準是**「有沒有一個狀態旗標能告訴我們玩家現在正在追這條線」**。
精通任務有 `player.masteryQuest === 'active'`——只對「正在做這件事的人」講一句,是有效資訊。
長老那條沒有任何旗標(玩家可能根本不想進聖地),對每個人都跳一句就是 CLAUDE.md 點名要刪的廢話。
反過來說:**這條規則也代表「不可以靜默忽略玩家的設定」**——安靜失效比讓他卡住更難查。

### 5.3 效能會不會跟 afk-offline 打架

不會,但**做法錯了就會**。見 §4.8:清單空時第一行早退、濾好的池快取、`enabled()` 不放熱路徑。
量法照 `docs/offline.md`:`node scripts/profile-offline.mjs --file <.testdata 檔> --slot N --hot`,
看 `spawnMob` 的 self-time 佔比有沒有從 4.1% 明顯上升。

另外一個**正向**副作用:被跳過的 BOSS 不會進 `bossStats` 的「首打真模擬」流程(`afk-offline.js:991-1011`),
離線結算反而會變快一點(每種 BOSS 第一次遇到都要逐拍真打)。

### 5.4 跟其他外掛/上游設定打架

- **與上游「迴避頭目」互補、不衝突**:那個是「所有王都躲、燒卷軸、清場」,本外掛是「指定的王不出現、免費、不清場」。
  兩個都開 → 沒被跳過的王照樣被瞬移躲掉,語意一致。
- **與 afk-bossring 會打架**,處理見 §4.7。
- **與 afk-training** 兩支都包 `spawnMob`,互相透明(木人場地圖不在 `DB.maps`)。

### 5.5 上游改版的失效點

| 失效點 | 症狀 | 怎麼發現 |
|---|---|---|
| `spawnMob` 改名/被包進 IIFE 拿不到 | 外掛啟動就 `console.warn` 停用 | 優雅降級,smoke 少一行 hooks OK |
| **`let pool = DB.maps[...]` 改成別的資料源** | **最陰險**:wrapper 照掛、池照換,但核心根本不讀它 → **跳過清單完全失效、零錯誤訊息** | 只能靠 §6 那條「連續出怪 N 次,該王 0 次」的斷言擋。**這條一定要進 smoke** |
| `DB.mobs[x].boss` 欄位改名 | 清單整個空掉(面板打開沒東西) | 玩家看得到,但也該在 smoke 斷言裡順便驗「清單非空」 |
| `noAutoTeleport` 語意改變 | 不該跳的變成可跳 | 人工掃(同步上游後的既有流程) |
| 作者加新的「不經 pool」的 BOSS 路徑 | 那隻跳不掉 | **預期行為**,不是 bug(作者一路在加:軍王之室 → 安塔瑞斯巢穴 → …) |

---

## 6. 驗收方式

一律 Playwright **headless**,腳本放 `.scratch/`(gitignore,用完刪)。

1. **濾池真的有效(核心斷言)**——用 `.testdata/` 的真實存檔灌進去 → `loadGame()` → 把地圖設成一張有王的野外圖
   (例:`fire_dragon`) → 設好跳過清單 → 迴圈 `mapState.mobs[0]=null; spawnMob(0);` **300 次以上**並統計出現的怪名。
   - 斷言 A:被跳過的那隻出現 **0 次**。
   - 斷言 B:同一輪把清單清空重跑,那隻出現 **> 0 次**(證明「0 次」不是因為機率低,而是真的被濾掉)。
     ⚠️ 一般野外出王率只有 1%,單靠自然機率要跑很多次 —— 用 `mapState.forceBoss = true` 每次強制,
     或暫時把 `player.d.bossEncounterPct` 拉高,把兩個斷言都變成確定性的。
   - 斷言 C:跑完之後 `DB.maps[那張圖].length` 與原始值相同(`finally` 有還原,沒有把濾過的池留在 `DB` 上)。
2. **離線一致**——同一份存檔 → 蓋 `afk_map_`/`afk_ts_` 走真實離線路徑(或 `window.__afk.forceCatchup(1440)`)→
   比對 `window.__afkKillTally`(`afk-offline.js:1511`)裡有沒有被跳過的那隻。斷言:0。
   ⚠️ **結算結果不是確定性的**(同設定兩次收益差 ±3~15%),所以只驗「有/沒有那隻」,不要拿收益數字當驗收。
3. **不可跳的地圖真的沒被動到**——在 `antaras_lair`(純 BOSS 房)與一間軍王之室各跑 50 次出怪,
   斷言 BOSS 照常出現、且不會出現 `mobId === undefined` 之類的空怪。
4. **存檔沒被改壞**——真實角色 → 開面板勾幾隻 → 關掉 → 比對 `lineage_idle_save_<n>` 與相關 key 沒被動
   (本外掛只寫自己的 `afk_bossskip_<slot>`,但這是 CLAUDE.md 明訂「會寫玩家存檔的功能上線前必測」的標準動作;
   尤其要涵蓋**主選單狀態(未載入角色)**下開面板不會誤觸存檔)。
5. **smoke 要加的**:
   - `scripts/smoke-hooks.mjs` 的 `need` 陣列加 `'[AFK-bossskip]'`。
   - **加一條上游改版守門**(對應 §5.5 那個最陰險的失效點):在第一輪桌機那頁,設一份臨時跳過清單、
     強制出怪 N 次、斷言該王 0 次。這是唯一能在「上游把出怪資料源換掉」當天就抓到的檢查。
   - `scripts/check-dom-ids.mjs` 自動涵蓋(面板的 id 都是自己產的);第三輪(關掉 afk-mobile)**不必擴充**——
     本外掛不做手機幾何、也沒有別的外掛依賴它的量測值。

---

## 7. 工作量評估

規模:**一支約 300~400 行的外掛 + 五處小改**,和 `afk-bossring.js`(180 行)同量級、比 `afk-training.js` 小很多。

| # | 步驟 | 內容 | 可獨立驗收 |
|---|---|---|---|
| 1 | 引擎 | `spawnMob` wrapper + 濾池 + 快取 + 地圖/怪物排除四道閘 + `AFK_BOSSSKIP` API(`spawnableBossIds` / `list` / `toggle`)。清單先用 console 設 | ✅ §6 的 1、3 |
| 2 | 離線驗證 | 不寫新程式,只跑 §6 的 2 與 `profile-offline.mjs` 對照 self-time | ✅ §6 的 2 |
| 3 | UI | 面板 + `#m-afk-navrow` 入口 + 搜尋 + 目前地圖置頂 + 精通任務那句確認 | ✅ 人工 + §6 的 4 |
| 4 | 場上清除 | 清單變更時掃一次(§4.6) | ✅ 人工 |
| 5 | 互動 | `afk-bossring.js` 的 `mapHasBossPool()` 改問 bossskip(一行) | ✅ 人工:全跳的圖不會連續燒卷軸 |
| 6 | 收尾 | `afk-plugin-block.html` + `index.html` 加 script、`afk-toggles.js` 內建目錄加一項、`smoke-hooks.mjs` 加 need 與新斷言、`docs/plugins.md` 外掛表(62 → 63) | ✅ smoke |

風險最高的是步驟 1 的**排除清單漏掉一張圖**(→ 出不了怪)與步驟 6 的**smoke 斷言沒補**
(→ 上游哪天換掉出怪資料源時整個功能安靜失效)。兩者都已在 §4.3 第 4 條與 §6.5 有對應的防線。
