# 外掛總表與核心補丁表

> 查表用。規則本身在 `CLAUDE.md`;這裡只放「有哪些東西、各自幹嘛」。

## 核心補丁(8 組·12 處錨點;`scripts/apply-core-patches.mjs`)

`--check` 印的數字(12)是錨點處數,不是補丁組數。

| # | 檔 | 內容 |
|---|---|---|
| 1 | js/03 | `maybeSpawnMobs` 抽出(tick 出怪塊→具名函式,離線快速結算共用同一份排程) |
| 2 | js/08 | `gainItem` 自帶強化值鉤子 `__afkTradRollEn`(afk-traditional 偽傳統) |
| 3 | js/13+js/06+js/25+js/28 | 存檔位 8→16(`SAVE_SLOT_MAX`;匯入重複掃描/傭兵招募/血盟成員掃描/PVP 對手清單) |
| 4 | js/22 | 寵/召 sprite ticker 改間接呼叫(讓 afk-powersave 包得住) |
| 5 | js/07 | 迴避頭目 × 自動找BOSS 互斥(`AFK_BOSSRING.huntActive`) |
| 6 | js/08 | `useItem` 加 `keepModal` 參數(自動瞬移不關玩家視窗) |
| 7 | js/10 | 「立即賣出」總開關關閉時不強制套規則(免誤賣沒標記的裝備) |
| 8 | js/05 | 聖地遺物判斷改「先判地區再掃背包」(純 `&&` 順序對調·語意相同):原式每殺一隻怪都 `player.inv.some()` 掃全背包,大背包離線補跑吃掉大量時間 |

## 外掛(51 支;載入順序見 `scripts/afk-plugin-block.html`)

| 檔案 | 功能 |
|---|---|
| `afk-toggles.js` | 外掛開關中樞(最先載;逃生門,自己不可關) |
| `afk-banner.js` | 非官方轉載橫幅讓位(量橫幅→`--orig-bar-h`/`body.afk-bar`→位移全螢幕容器+桌機/平板彈窗讓位;基礎設施,無開關) |
| `afk-synccompress.js` | 存檔即時壓縮(預設關;把 `_lzSet` 換回同步壓縮,根治登出/多開後存檔未壓縮爆滿;代價=存檔當下多花 0.02~0.4 秒) |
| `afk-lzcache.js` | 存檔解壓快取(同一份壓縮字串只解一次;核心每殺一隻怪都重讀整包血盟狀態,離線結算 4×) |
| `afk-ui.js` | 共用彈窗:接管 alert、`AFK_UI.confirm`、openLayer/closeLayer(返回鍵/ESC 關最上層) |
| `afk-extradata.js` | dex/wiki 共用手動補充資料(`AFK_EXTRA`:itemAcquire/武器特性白話/mapName) |
| `afk-offline.js` | 離線掛機整套(關遊戲也結算掛機收益;monkey-patch loadGame/saveGame/changeMap/killMob/gainItem,見 `docs/offline.md`) |
| `afk-mobile.js` | 手機版面薄殼(底部導覽列切三欄、手機幾何的彈窗讓位、浮動日誌;版面用上游原版) |
| `afk-backnav.js` | 手機返回鍵/手勢在子畫面回上層而不是關 PWA |
| `afk-battlehud.js` | 手機戰鬥狀態列(取代上游只有 HP/MP 的 #mobile-vitals;自己量橫幅) |
| `afk-mapbar.js` | 手機冒險地圖標題列壓成兩排(純 CSS,自己判手機) |
| `afk-nozoom.js` | 取消雙擊放大(觸控裝置;`body,body *` touch-action:manipulation,捏合縮放保留) |
| `afk-slotinfo.js` | 選角卡片疊「掛哪張圖/掛多久」(讀 afk-offline 的 afk_map_/afk_ts_,唯讀) |
| `afk-loadslots.js` | 卡片式選角擴到 16 格(搭配補丁3) |
| `afk-dex.js` | 掉落查詢(五張掉落表+特殊掉落 SPECIAL_BLOCKS;`?view=dex` 獨立頁) |
| `afk-wiki.js` | 小百科(多分頁+統一搜尋;`?view=wiki` 獨立頁;改內容跑 `/update-wiki`) |
| `afk-storage.js` | 首頁「⚙ 設定」選單(MENU_ITEMS 可擴充)+檢查存檔大小 |
| `afk-notice.js` | 首頁公告卡(通用框架;檔頭 `NOTICE=null` 就不顯示,要發公告填一組設定即可) |
| `afk-quotawarn.js` | 存檔空間警告(localStorage >80% 時首頁紅卡提醒刪角;唯讀;估算與 afk-storage 同套) |
| `afk-history.js` | 離線掛機紀錄卡片(讀 afk_hist_<slot>,唯讀) |
| `afk-diag.js` | 快取診斷(全程唯讀;欄位各自包錯;產物自帶版本號) |
| `afk-reissueid.js` | 換發身分證(角色身分碼重發) |
| `afk-powersave.js` | 省電模式(關戰鬥動畫/降更新頻率;涵蓋寵/召 ticker=補丁4) |
| `afk-statpts.js` | 能力值來源分解(能力圖下方單一區塊) |
| `afk-statlist.js` | 能力分頁條列式(拿掉經典背景圖改大字卡片;純 CSS,DOM/updateUI 不動;配點中改單欄) |
| `afk-autobuy.js` | 自動買肉/魔法屏障卷軸補貨(預設開;離線結算共用 `__afkAutobuyCheck`) |
| `afk-training.js` | 木人場(量真實 DPS;獨立 map id `afk_dummy`) |
| `afk-junkmgr.js` | 廢品標記管理(木人場鈕下方;列出/搜尋/多選刪除 `player.junkPrefs`,刪除同時取消背包同款標記;規則標記 `_ruleJunk` 刻意不列;虛擬捲動) |
| `afk-mercguard.js` | 傭兵招募被擋下時跳彈窗(收核心自己吐的紅字原文,不重刻擋下條件;核心只寫系統日誌→玩家看不到) |
| `afk-bossring.js` | 傳送控制戒指自動找BOSS(缺卷軸自動購買;與迴避頭目互斥=補丁5) |
| `afk-itemsearch.js` | 背包名稱搜尋(包 renderTabs 重注入;純顯示層過濾) |
| `afk-invlist.js` | 背包條列式(桌機手機通用) |
| `afk-eqlist.js` | 裝備分頁條列式(隱藏 12 格圖形窗,露出原生部位條列) |
| `afk-npclist.js` | 村莊 NPC 條列式(鏡射地圖 NPC 成列表) |
| `afk-mobname.js` | 怪物名稱顯示模式三選一(純 CSS+body data 驅動) |
| `afk-toast.js` | 手機 toast(包 logSys,點擊同步窗內訊息浮現) |
| `afk-touchtip.js` | 手機長按看資料(技能/商店/製作/收集冊/背包) |
| `afk-notip.js` | 關閉物品懸停資訊框(預設關;技能說明保留、只在滑鼠環境動作;不印 hooks OK 不進 smoke) |
| `afk-trackinfo.js` | 狀態欄顯示魔物追蹤剩餘時間(包 renderStatusEffects,補一格) |
| `afk-battlebuffs.js` | 手機戰鬥框下方鏡射整條狀態欄(必須排在 afk-trackinfo 之後才含追蹤格) |
| `afk-relicguard.js` | 快速廢品的「全選」跳過遺物(包 quickJunkSelectAll/buildQuickHeader) |
| `afk-enhtarget.js` | 快速強化目標上限 +12→+15(包 buildQuickEnhanceHeader 補下拉;執行端本就鉗各裝備 enhanceCap) |
| `afk-retrial.js` | 試煉批次兌換(試煉道具持續掉落·已完成也照掉;面板自訂數量重複兌換;試煉狀態只讀不寫;包 trialItemActive/trialQHTML/build50TrialHTML) |
| `afk-traditional.js` | 傳統模式(偽)/自動衝裝(掉落自帶強化值;靠補丁2 的 `__afkTradRollEn` 鉤子) |
| `afk-warehouse.js` | 倉庫增強(金幣全存/全取、遺物與席琳遺骸分類) |
| `afk-dograce.js` | 賽狗場迷你遊戲(奇岩城鎮限定;自製) |
| `afk-pwa.js` | PWA 安裝 UI+圖桶/程式桶對帳(reconcile 送 SW) |
| `afk-sw.js` | Service Worker 註冊(sw.js 是我方檔,上游無 PWA) |
| `afk-syncinfo.js` | 首頁顯示原作者連結+原版同步時間(讀 version.json 的 buildAt) |
| `afk-analytics.js` | Cloudflare Web Analytics(只在正式站注入) |
| `afk-skin.js` | 首頁外掛入口收納(桌機🔌鈕/手機依原版按鈕樣式;固定最後載,MutationObserver 等入口到齊) |

## 獨立頁與跨頁連結(dex↔wiki)

`?view=dex`/`?view=wiki` 鋪滿整頁+頁首導覽;跨頁一律走對方暴露的 mode-aware `goto`(`AFK_DEX_API.goto({q})`/`AFK_WIKI_API.goto({tab,cls,q})`,自動判斷模態連模態/網址連網址);「名字→跳掉落查詢」inline 連結用 `<span class="m-dexlink" data-dexq="名字">`(全域委派);開對方前先 `close()` 來源模態。新增跨頁連結要重用/擴充 `goto`,不要在呼叫端自己判斷。

## 🧠 城堡建築系統開發教訓（寫給下次寫血盟資料相關功能的人）

以下條目是開發 `afk-castle-buildings.js` 過程中踩過的坑，每條都符合「成因仍在、自動檢查擋不掉、下次想不起來」三條件。

### 1. 核心補丁定義後要手動執行 `node scripts/apply-core-patches.mjs`

補丁寫在 `apply-core-patches.mjs` 只算「定義」，不會自動套用到上游鏡像檔。每次新增或修改補丁後都要手動跑一次執行，再用 `--check` 確認所有錨點都命中。

### 2. 新外掛要同時註冊到 `afk-plugin-block.html`

寫完一支新 `afk-*.js` 後，除了確認 `index.html` 有 `<script>` 標籤（上游鏡像），還要在 `scripts/afk-plugin-block.html` 的對應位置補上同一行。前者是開發環境用，後者是正式站注入用。兩邊缺一都會造成外掛沒載入。

### 3. 新 NPC 除了對話分派和座標，還要加入城鎮的 NPC 清單

要讓 NPC 出現在村莊裡，需要三件事：
- `TOWN_NPC_SPOTS`（位置座標）— `js/11-world-map.js`
- 對話 `switch` 分派 — `js/11-world-map.js`
- `DB.towns[...].npcs`（NPC 清單）— `js/00-data.js`

只做前兩項，NPC 不會出現在地圖上。核心補丁要同時涵蓋三處。

### 4. DOM `id` 字串必須與 `getElementById` / `querySelector` 完全一致

手寫 HTML 的 `id` 屬性和 JS 裡查詢用的字串是兩份各自維護的文字，沒有編譯期檢查。改一邊就要同步改另一邊。最佳做法：把 id 字串定義成常數，或至少改完後全文搜尋確認一致。

### 5. `_clanNormalizeState` 的 `_validBld` key 格式必須與外掛的 `BUILDING_IDS` 一致

`_clanNormalizeState` 用 `_validBld` 白名單決定哪些建築 key 要保留，外掛的 `BUILDING_IDS` / `BUILDING_DATA` 決定實際使用的 key。這兩份如果格式不一致（例如一邊 `weapon_shop` 另一邊 `weaponShop`），正規化後所有建築資料都會被丟掉。**兩邊必須用同一組 key，且 `_validBld` 要跟著外掛走，不是反過來。**

### 6. 寫入血盟資料一定要呼叫 `_clanWriteState`

`_clanReadState()` 讀出的是 clone，修改它不會自動寫回 localStorage。修改完血盟狀態（例如 `castleBuildings`）後，一定要呼叫 `_clanWriteState(st)` 才能持久化。只呼叫 `saveGame()` 只存玩家資料，不存血盟資料。

**陷阱**：`_clanWriteState(st)` 內部會呼叫 `_clanNormalizeState(st)`，所以傳入的 `st` 物件中，不在正規化白名單內的欄位會被砍掉。見第 9 條。

### 7. 遊戲內特殊貨幣不要假設有對應的 `item.id`

龍之鑽石在遊戲中由 `js/24-pandora-relic-market.js` 管理，透過 `window.pandoraGetSharedDiamonds()` 讀取、`window.pandoraAdjustSharedDiamonds(delta)` 增減。`dragon_diamond` 不是 `player.inv` 裡的物品，`countItem('dragon_diamond')` 永遠回傳 0。

**判斷流程**：要讀取/消耗某種資源時，先確認它在遊戲中的儲存方式（背包物品？獨立變數？共用函式？），不要直接假設 `countItem` / `consumeItem` 能用。

### 8. 倒數計時不能只靠 render 當下的靜態值

`renderCastleBuildingsPanel()` 在呼叫當下計算 `formatRemaining(end)` 產出「剩餘 XX 分 XX 秒」字串，但這個字串不會自動更新。要讓倒數即時跳動，必須：
- 在 `initCastleBuildings()` 或 `showCastleBuildingsPanel()` 啟動 `setInterval(fn, 1000)`
- interval 回呼裡重新查 DOM、重新計算剩餘時間、更新 `textContent`
- 如果 UI 從 overlay 改成 inline（直接嵌在 NPC 對話框），interval 的條件判斷要跟著調整（不要依賴 overlay 的 `offsetParent`）

### 9. `_clanNormalizeState` 會砍掉不在白名單內的欄位

`_clanNormalizeState` 的設計目的是確保髒資料不會進到 localStorage，但它對 `castleBuildings` 的處理方式是：只保留 `_validBld` 列出的 key，且每個 key 只保留 `lv` / `startAt` / `finishAt` 三個欄位。

如果外掛需要額外欄位（例如 `lastTick`、`accumulated`、`lastHarvestTime`、`targetLevel`），**必須同時修改 `_clanNormalizeState` 的正規化邏輯**，否則 `_clanWriteState` 一寫就把這些欄位清掉了。

**檢查清單**：每當要為建築物件增加新欄位時，問自己：
1. 這個欄位會經過 `_clanWriteState` 嗎？→ 會
2. `_clanNormalizeState` 的正規化邏輯有保留它嗎？→ 沒有的話就要加
3. `_validBld` 白名單有包含這棟建築嗎？→ 沒有的話也要加
