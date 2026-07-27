# 離線掛機(afk-offline)——✅ 啟用中

> 改離線行為前先讀本檔＋`afk-offline.js` 檔頭註解。

**歷史**:2026-07-21 曾整套暫停(上游 v3.6.97~v3.7.17 自帶離線收益、又持續改動,我方讓位)。**2026-07-24 恢復啟用**:上游 v3.7.94 反手把 `js/27-offline-rewards.js` 從 index.html **整個移除**(不再載入)、還主動清掉 `lineage_idle_offline_v1_*` 殘骸——上游自己放棄離線收益了。讓位對象消失 → 不恢復的話玩家關遊戲=**零離線收益**,故解鎖。**實測**(真實 Lv.97 存檔·CPU throttle 模擬手機·24h 滿載):收益/掉落正常、存檔簽章與內容無損、撞死即停在;耗時 桌機 5s / 4x 手機 43s / 6x 低階手機 80s。

- **補丁 8 不需要、也沒恢復**:它當初是「讓上游 js/27 讓位給 afk-offline」用的,但 js/27 現在**根本不載入**,afk-offline 直接就是唯一離線收益來源。上游哪天若把 js/27 加回 index.html,才要重新評估雙方會不會搶(見下方兩條 🚨)。
- `afk-slotinfo` 的「📍 掛機地圖」「⏱ 已掛機多久」資料源 `afk_map_`/`afk_ts_` 由 afk-offline 心跳蓋、中文名走 `window.__afk.mapName`——afk-offline 一旦再停用,這兩段要跟著關(否則露凍住的假數字/英文 id)。

核心原則:**離線掛機=把「在線上會發生的掛機」照跑一遍**(同圖續掛、撞死即停結算到死前、存活回原地)。「離線」定義=**關閉遊戲**;分頁切背景不算(遊戲照跑、心跳照蓋錨點,是預期行為,不要「順手修」)。

## 實作要點

- 掛點:外掛自己 monkey-patch `loadGame`(開頭擷取錨點/結尾結算)、`saveGame`/`changeMap`(結尾 stamp)、`killMob`/`gainItem`(結算期間計數);出怪走核心補丁抽出的 `maybeSpawnMobs()`(與線上同一份排程)。
- 💾 分段檢查點:結算每 ~5 秒 saveGame+錨點推進到「已結算時點」;**任何新程式碼想在結算(`catchingUp`)期間蓋 afk_ts 都是 bug**。
- ⚡ 快速結算:取樣→事件驅動逐殺(批次擊殺保 AOE、BOSS 懶驗證+抽驗、維持自動續 buff);危險/特殊圖退回全模擬。**快速段不跑 tick()/autoActions**——「只寫在 autoActions 的自動行為」要各自補,補法=**直接呼叫原作那支函式**(如瞬移 `useItem(uid,true)`),不要自己刻守衛清單(必漏、必分歧)。
- 排名/計時挑戰類(時空裂痕、排名攀登)**離線一律不續、不結算**(續=刷榜 exploit);攀登/遺忘之島這類非選單圖用外掛自存旅程狀態+原作進場函式還原,不可走 gotoMap 選單路徑。
- **判準:遊戲邏輯的時間判斷用 `state.ticks`,不用 `Date.now()`**(補跑壓縮時間,牆鐘幾乎凍結)。例外=「關遊戲也該倒數」的(攻城冷卻)留牆鐘。
- **ff 洩漏判準**:補跑(`state.ff`)期間,戰鬥路徑**直接**呼叫的 `render*`/重副作用(`saveGame`)要被 `!state.ff` 擋住或函式內早退;**自己跑的 timer(setInterval/rAF)也要問「補跑期間它還在跑嗎」**。守衛用 `state.ff && !state.ffSmall`(小補跑要放行)。上游是原文改不得→這類守衛由 afk-offline 以 wrapper 實作(如 sprite ticker、音效靜音)。
- debug:`window.__afk.forceCatchup(分鐘, noFast)`。全模擬慢是戰鬥模擬本身,不是掃描/記憶體,別往那優化。
- **🚨 背景分頁回前景由 afk-offline 包 `settleBackgroundMs` 接管,交回核心 `queueCatchupMs` 逐 tick 補跑**:上游 v3.7.17 把 visibilitychange/bfcache 從 `queueCatchupMs` 改成 `settleBackgroundMs` → `offlineSettleCatchup`(統計一次結算),那套本來要靠上游自己的實戰取樣。我方直接把 `settleBackgroundMs` 包成 `queueCatchupMs(ms)`,不走上游的一次結算(核心補跑有時間預算讓步 `FF_BUDGET_MS`＋抽樣快轉,不會凍住分頁)。判準:**上游只要再動 js/01 的 visibilitychange/pageshow 或 catchup 入口,就要重驗這條**——「離線=關遊戲、背景=遊戲照跑補回來」是本外掛的前提,不是可調偏好。
- **🚨 目前 js/27 不載入 → afk-offline 是唯一離線收益來源、無雙重發獎**。但上游若哪天把 `js/27-offline-rewards.js` 加回 index.html,兩套就會搶(它也包 loadGame/saveGame/killMob/changeMap)→ 屆時測「離線回來」時,時間戳要三處一起回撥:afk-offline 的 `afk_ts_<slot>`、上游的 `lineage_idle_offline_v1_*`、**以及存檔裡的 `player.offlineHunt.awaySince`**(在 `d.p.offlineHunt`)。漏掉存檔內那份 → 上游判定「離線 0 分鐘」看似和平共存,**實際會雙重發獎**(踩過)。
