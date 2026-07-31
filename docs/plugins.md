# 外掛總表與核心補丁表

> 查表用。規則本身在 `CLAUDE.md`;這裡只放「有哪些東西、各自幹嘛」。

## 核心補丁(9 組·13 處錨點;`scripts/apply-core-patches.mjs`)

`--check` 印的數字(13)是錨點處數,不是補丁組數。

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
| 9 | js/05 | 吉爾塔斯魔杖不再「每殺一隻怪就整個人重算」:buff 還在且加成值(依邪惡值)沒變時,重算前後的 `d` 完全一樣＝白算。**離線結算最大的單一熱點**——一個傭兵拿杖＝每殺重算兩次(`_allyLevelRecompute` 內部又叫一次玩家 `calcStats`),而每次重算都經 `getClanBuffStats` 重 parse 整包血盟。實測真實存檔 1 小時離線 54s→1.1s |

## 外掛(58 支;載入順序見 `scripts/afk-plugin-block.html`)

| 檔案 | 功能 |
|---|---|
| `afk-toggles.js` | 外掛開關中樞(最先載;逃生門,自己不可關) |
| `afk-banner.js` | 非官方轉載橫幅讓位(量橫幅→`--orig-bar-h`/`body.afk-bar`→位移全螢幕容器+桌機/平板彈窗讓位;基礎設施,無開關) |
| `afk-synccompress.js` | 存檔即時壓縮(預設關;把 `_lzSet` 換回同步壓縮,根治登出/多開後存檔未壓縮爆滿;代價=存檔當下多花 0.02~0.4 秒) |
| `afk-lzcache.js` | 大資料重複處理的快取,兩層:①存檔解壓(同一份壓縮字串只解一次;離線結算 4×) ②血盟 Buff 查詢(`getClanBuffStats`——解壓被快取後剩下的成本是每次重 `JSON.parse` 242KB 血盟資料＋整份正規化,`recomputeStats` 每次都會問一次) |
| `afk-clanroster.js` | 血盟名冊瘦身(核心把「遇過的玩家型 NPC」逐一登記在血盟共用桶、**只增不減**、上限一萬筆;而野外 PVP 每生成一個對手就整包讀改寫一次 → 越玩越慢。改成盟主全留、每盟留最近 20 個成員、無血盟路人留最近 200 個。實測玩家存檔 6,189 筆→620 筆、每離線小時 20.0s→3.4s) |
| `afk-allyslim.js` | 傭兵快照瘦身(傭兵＝來源角色的深拷貝,隊長存檔裡每個傭兵都各帶一份**沒人讀**的資料;實測三位玩家全部存檔位未壓縮 5,299KB 中傭兵快照佔 1,644KB,光廢品標記就 824KB。清空 junkPrefs/pvpAlignLock/pandoraMarket2/_offStats/autoSellRules/lastMapByCat 六個欄位,存檔小 33~38%。**新增欄位前要過三關**:js/02 整份沒有(player=ally 視窗只跑 recomputeStats)、js/06 整份沒有、全 repo 只以 `player.` 前綴出現;`config` 是反例不能清。清空不 delete——上游哪天加讀取,`{}` 只是空的、undefined 會炸) |
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
| `afk-wiki.js` | 小百科(多分頁+統一搜尋;`?view=wiki` 獨立頁;改內容跑 `/update-wiki`。裝備頁走檔內的**列表篩選引擎** `makeListFilter`:索引→純函式篩選→只畫前 40 列、詳情點開才建;要把它給第二個頁面用再抽成獨立外掛,且那支**不可有開關**) |
| `afk-storage.js` | 首頁「⚙ 設定」選單(MENU_ITEMS 可擴充)+檢查存檔大小 |
| `afk-fullsave.js` | 完整資料備份與還原(本機檔案＋**六碼轉移碼**·`storage` 子項)。轉移碼另掛 `fullsavecode` 子項:整包上傳到第三方(Litterbox)、24 小時後自動刪,關掉只剩檔案那半;服務選型(比過 6 家)與「別只看標頭、要拿真 file:// 頁面實測」見 `docs/save-transfer.md`。**整包搬不挑 key**——白名單會跟不上上游、漏搬是安靜失效;還原=`localStorage.clear()` 全清後用 `_lzSetStoredRaw` 原樣寫回(**不可用 `_lzSet`**:它先寫明文再背景壓縮,明文可能當場撐爆配額) |
| `afk-notice.js` | 首頁公告卡(通用框架;檔頭 `NOTICE=null` 就不顯示,要發公告填一組設定即可) |
| `afk-quotawarn.js` | 存檔空間警告(localStorage >80% 時首頁紅卡提醒刪角;唯讀;估算與 afk-storage 同套) |
| `afk-history.js` | 離線掛機紀錄卡片(讀 afk_hist_<slot>,唯讀) |
| `afk-diag.js` | 快取診斷(全程唯讀;欄位各自包錯;產物自帶版本號) |
| `afk-reissueid.js` | 換發身分證(角色身分碼重發) |
| `afk-powersave.js` | 省電模式,面板六項**由上而下省電效果遞減**:降更新頻率／關戰鬥動畫(本外掛自己的,涵蓋寵/召 ticker=補丁4)＋戰鬥特效／傷害數字／背景音樂／音效(**直接讀寫核心自己的狀態並呼叫核心 setter,不另存一份**——原本散在標題畫面與遊戲中音量列三處,玩家要省電時是四個一起關;核心少哪支就安靜不列那列) |
| `afk-statpts.js` | 能力值來源分解(能力圖下方單一區塊) |
| `afk-statlist.js` | 能力分頁條列式(拿掉經典背景圖改大字卡片;純 CSS,DOM/updateUI 不動;配點中改單欄) |
| `afk-autobuy.js` | 自動買肉/魔法屏障卷軸補貨(預設開;離線結算共用 `__afkAutobuyCheck`) |
| `afk-training.js` | 木人場(量真實 DPS;獨立 map id `afk_dummy`;隊員全員不死＝**判定前補到真實上限**不灌血量;HUD 兩檢視:來源長條圖(玩家/各傭兵/**每隻**寵物/**每種**召喚物)與每隻訓練怪;可選「MP 不消耗」,預設關) |
| `afk-junkmgr.js` | 廢品標記管理(木人場鈕下方;列出/搜尋/多選刪除 `player.junkPrefs`,刪除同時取消背包同款標記;規則標記 `_ruleJunk` 刻意不列;虛擬捲動) |
| `afk-mercguard.js` | 傭兵招募被擋下時跳彈窗(收核心自己吐的紅字原文,不重刻擋下條件;核心只寫系統日誌→玩家看不到) |
| `afk-bossring.js` | 傳送控制戒指自動找BOSS(缺卷軸自動購買;與迴避頭目互斥=補丁5) |
| `afk-itemsearch.js` | 背包名稱搜尋(包 renderTabs 重注入;純顯示層過濾) |
| `afk-invlist.js` | 背包條列式(桌機手機通用;**本檔整片鋪底的 `background:...!important` 會蓋掉核心給的狀態底色**——「無法裝備/無法學習」的 `bg-red-950/40` 就這樣被吃掉過,已補回紅底＋左紅條,`.bg-red-950\/40` 與 `:has(.text-red-500)` 兩種選法各寫一條、不可併成 selector list) |
| `afk-eqlist.js` | 裝備分頁條列式(隱藏 12 格圖形窗,露出原生部位條列) |
| `afk-npclist.js` | 村莊 NPC 條列式(鏡射地圖 NPC 成列表) |
| `afk-mobname.js` | 怪物名稱顯示模式三選一(純 CSS+body data 驅動) |
| `afk-toast.js` | 手機 toast(包 logSys,點擊同步窗內訊息浮現) |
| `afk-touchtip.js` | 手機長按看資料(技能/商店/製作/收集冊/背包) |
| `afk-notip.js` | 關閉物品懸停資訊框(預設關;技能說明保留、只在滑鼠環境動作;不印 hooks OK 不進 smoke) |
| `afk-dollcursor.js` | 關閉魔法娃娃游標(預設關;包 `applyDollCursor`)。上游裝娃娃時會① body cursor 換娃娃圖 ② 加 `has-doll-cursor` 讓可點擊處也吃 `cursor:inherit!important` ③ 啟用跟著滑鼠跑的 `#doll-cursor-glow`。**手機看到的那顆「點一下留下的光點」就是③**(觸控會補送合成 mousemove),所以兩者是同一個開關、不能只關一半 |
| `afk-trackinfo.js` | 狀態欄顯示魔物追蹤剩餘時間(包 renderStatusEffects,補一格) |
| `afk-battlebuffs.js` | 手機戰鬥框下方鏡射整條狀態欄(必須排在 afk-trackinfo 之後才含追蹤格) |
| `afk-relicguard.js` | 快速廢品的「全選」跳過遺物(包 quickJunkSelectAll/buildQuickHeader) |
| `afk-enhtarget.js` | 快速強化目標上限 +12→+15(包 buildQuickEnhanceHeader 補下拉;執行端本就鉗各裝備 enhanceCap) |
| `afk-attrbatch.js` | 碧恩「賦予屬性」一鍵衝到指定階段/星數(包 renderBianAttr 加面板;把 doBianAttr 的副作用暫時靜音後迴圈呼叫→規則單一真相仍在核心;「這輪卷軸沒被扣」＝核心擋下,拿它的訊息當停止原因) |
| `afk-cursebatch.js` | 詛咒卷軸一鍵弱化(包 openModal 掛入口;**不看 `isMaxEnhanced`**——上游滿強化就整顆強化鈕消失,連帶讓詛咒卷軸沒入口。批次同樣靠靜音副作用迴圈呼叫 executeCurseDeEnhance;背包堆疊要**自己先拆一件**,否則核心每次呼叫各拆一件變成 N 件各 -1) |
| `afk-retrial.js` | 試煉批次兌換(試煉道具持續掉落·已完成也照掉;面板自訂數量重複兌換;試煉狀態只讀不寫;包 trialItemActive/trialQHTML/build50TrialHTML) |
| `afk-traditional.js` | 傳統模式(偽)/自動衝裝(掉落自帶強化值;靠補丁2 的 `__afkTradRollEn` 鉤子) |
| `afk-warehouse.js` | 倉庫增強(魔法書標`[已學習]`/`[無法學習]`並各給底色——判定一律用核心那兩條(`player.skills` 有沒有它、`skillReqLv()` 是否 undefined),不自己判職業表;金幣全存/全取、遺物與席琳遺骸分類、**只列可穿＋不可穿標紅**;可穿判定一律呼叫核心 `checkCanEquip`,過濾包在 `whMatchFilter`＋`whMatchSearch` 兩支上(搜尋不走 filter),核心的「沒有物品」空訊息才會正確) |
| `afk-whbatch.js` | 倉庫批次存取(**預設關**——會改掉「點清單」原本的意思;包核心函式型:照樣安裝 wrapper、每次重繪問 `enabled()`,關掉就收乾淨注入的 UI 並透明放行,故開關即時生效且仍印 hooks OK。⚠️ `register` 必須早於第一次 `enabled()`:找不到登錄項時預設值一律回 true(afk-toggles.js:39),先問就把 def:false 問成 true。「🗂️ 批次」鈕→點清單=勾選、全選、一次搬完;整批共用一次 `whTxnSnapshot`/`whTxnCommit`＝核心 `whOneClickDeposit` 的既有模式,實測 4998 格倉庫由 145ms/件 → 0.1ms/格。搬移規則逐條比照核心 whDeposit/whWithdraw,唯一差別是一律整疊。⚠️ **不可用 uid 當索引**:玩家倉庫真的存在「兩格共用同一 uid」(4998 格裡 17 組),uid→物品的 map 只留最後一格,另一格會被連同數量一起刪掉＝真實遺失(踩過,少 35 件);一律掃來源陣列比對勾選集合。同 sig 查找改 Map(核心 `_whStackFind` 是線性 find,N 筆就 O(N²)、幾千格會卡住)) |
| `afk-dograce.js` | 賽狗場迷你遊戲(自動化分頁入口;押金幣或龍鑽、中獎自動入袋;自製) |
| `afk-pwa.js` | PWA 安裝 UI+圖桶/程式桶對帳(reconcile 送 SW) |
| `afk-sw.js` | Service Worker 註冊(sw.js 是我方檔,上游無 PWA) |
| `afk-syncinfo.js` | 首頁顯示原作者連結+原版同步時間(讀 version.json 的 buildAt) |
| `afk-analytics.js` | Cloudflare Web Analytics(只在正式站注入) |
| `afk-skin.js` | 首頁外掛入口收納(桌機🔌鈕/手機依原版按鈕樣式;固定最後載,MutationObserver 等入口到齊) |

## 獨立頁與跨頁連結(dex↔wiki)

`?view=dex`/`?view=wiki` 鋪滿整頁+頁首導覽;跨頁一律走對方暴露的 mode-aware `goto`(`AFK_DEX_API.goto({q})`/`AFK_WIKI_API.goto({tab,cls,q})`,自動判斷模態連模態/網址連網址);「名字→跳掉落查詢」inline 連結用 `<span class="m-dexlink" data-dexq="名字">`(全域委派);開對方前先 `close()` 來源模態。新增跨頁連結要重用/擴充 `goto`,不要在呼叫端自己判斷。
