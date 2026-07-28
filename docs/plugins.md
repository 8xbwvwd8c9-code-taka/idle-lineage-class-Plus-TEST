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
| `afk-training.js` | 木人場(量真實 DPS;獨立 map id `afk_dummy`;隊員全員不死＝**判定前補到真實上限**不灌血量;HUD 兩檢視:來源長條圖(玩家/各傭兵/**每隻**寵物/**每種**召喚物)與每隻訓練怪;可選「MP 不消耗」,預設關) |
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
