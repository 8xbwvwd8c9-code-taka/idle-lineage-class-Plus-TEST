# 存檔搬家(跨裝置轉移)—— 方案①**已實作**,雲端那半仍未定

> **方案①(純檔案匯出入)= `afk-fullsave.js`,2026-07-31 已完成**(首頁「⚙ 設定 → 💾 整包備份／還原」)。
> 雲端那半(②~⑤)仍卡在「要不要做、由誰出成本」沒有結論,先擱著;下面的方案比較與平台限制保留備查。
>
> 實作時與本文原稿的三處差異(都是刻意的,別照原稿改回去):
> - **匯出/清除都不挑 key**——原稿寫「前綴白名單」,實作時發現那仍是一份要跟著上游走的清單,
>   一律整包搬、還原用 `localStorage.clear()` 全清再原樣寫回。
> - **不用逐個 `_lzRemoveStored`**——原稿擔心 clear 之後在途的背景壓縮會蓋掉新值;實測不會:
>   worker 回來時會比對 `_lsGet(key)` 是不是它記得的原值(`js/00-data.js:136`),對不上就自己 return。
> - **不做「強制先下載一份備份」**——`download()` 回 true 只代表觸發了動作,擋下載/取消/存到哪都偵測不到,
>   拿它當前置條件是假保證。改成確認框裡用文字提醒先按匯出。

## 要解決什麼

玩家換裝置時搬不動進度。核心 `js/13-shop-save.js` 的 `exportSave(slot)` / `importSave(n)` **一次只能搬一格角色**,而倉庫/寵物/血盟/龍之鑽石是「附在該格匯出檔裡的快照」,匯入時還會逐項跳 `confirm` 問要不要覆蓋共用資料。16 格角色等於要來回 16 次 —— `afk-reissueid.js:465` 的警語就是叫玩家「每一個角色都手動匯出一次」。

目標:**整包 localStorage 一次搬完**(全部存檔格 + 共用倉庫 + 寵物 + 收集冊 + 血盟 + 外掛設定)。

## 方案比較

| | 誰出成本 | 玩家體驗 | 主要風險 |
|---|---|---|---|
| **① 純檔案匯出入 + 系統分享** | 沒人出(零後端) | A 按匯出 → 手機跳系統分享(LINE / AirDrop / 存到自己雲端)→ B 下載後匯入 | 幾乎沒有;多幾步手動操作 |
| **② Google Drive(玩家自己的空間)** | 玩家(各自 15GB) | 兩台登入同一個 Google 帳號 | **`file://` 玩家完全用不了**(OAuth 授權來源不能是 file://);要玩家把 Google 帳號授權給非官方外掛;Google scope 政策改過好幾次 |
| **③ 短期轉移碼(Cloudflare,30 分鐘真的刪)** | 開發者,但極小 | 最好 —— 6 位數字碼、零帳號、`file://` 也能用 | 要維護 Worker;**不能拿來長期存** |
| **④ P2P 直傳(WebRTC)** | 近乎零(只傳配對訊號) | 6 位數碼配對,資料不落地 | **兩台要同時開著**;手機行動網路常穿不過 NAT,失敗還查不出原因 |
| **⑤ Cloudflare R2(10GB)** | 開發者 | 同 ③,可長期保留 | **要綁信用卡**,超量會真的扣款 |

### 評估過程中釐清的兩件事

**「轉移」和「收集玩家存檔來除錯」是兩個需求,綁在一起才會爆容量。** 轉移中的包同時只存在幾十個(30 分鐘後就沒用),D1 免費的 500MB 綽綽有餘;是「留著給作者事後撈」那個需求讓它無限累積。除錯需求用方案 ① 就解決了——叫玩家按「匯出成檔案」用 LINE 傳過來,拿到的是完整存檔,比從雲端撈更直接。

**方案 ① 是所有方案的地基**,不管雲端那半最後選什麼都該先有它:零成本、`file://` 可用、雲端掛掉時的永久保底。手機上匯出可用 `navigator.share`(Web Share API level 2)直接叫出系統分享選單,比「下載到某個資料夾再自己找」順很多。

## 打包 / 還原(不管走哪條路都一樣)

### 整包搬,不挑 key

一度想排掉離線錨點(`afk_ts_*`)、分頁心跳(`fb5_active_role_sessions_v1`)、跨分頁鎖這類「機器狀態」,**已否決**。排除清單要跟著上游走,作者哪天新增一個 key 我們不會知道,漏搬是**安靜失效**——玩家搬完、玩一陣子才發現東西不見,而且查不出來。

整包複製的正確性論證更硬:**B 裝置變成 A 的完整複本,A 能正常跑,B 就能正常跑。**

離線錨點一起搬 → 新裝置會再結算一次那段離線時間。單機遊戲、沒有跨裝置經濟,兩邊各自結算沒有實質後果,不值得為它開一份要長期維護的清單。

### 格式與函式

原值原樣搬,不做任何轉換:

```js
{ format:'idle-lineage-full', schema:1, exportedAt:'<ISO>', app:'<version.json 的 app>',
  keys: { '<localStorage key>': '<localStorage.getItem 的原始字串>' } }
```

- 還原一律用 **`_lzSetStoredRaw(key, raw)`**(`js/00-data.js:113`)—— 它繞過壓縮 Worker 直寫、並讓在途的背景壓縮失效,正是這裡要的。
- **不可以用 `_lzSet`**:它會先寫明文再背景壓縮,明文可能當場撐爆 5MB 配額。
- LZString 的 `compressToUTF16` 輸出範圍是 U+0020~U+801F、**不含 surrogate**,原值可以安全放進 JSON / 用 UTF-8 編碼,不會壞字。
- 檔案下載可重用核心 `downloadSaveFile(data, fname)`(`js/13-shop-save.js:577`);選檔照 `importSave` 的 `<input type="file">` + `FileReader`(`js/13-shop-save.js:587`)。

### 還原順序(配額最省)

1. 警語 + `AFK_UI.confirm`(`afk-ui.js:257`)確認
2. **`localStorage.clear()` 全清**
   ⚠️ 原稿寫的是「只刪 `lineage_idle_`/`fb5_`/`afk_`/`dograce_` 前綴、不要用 clear()」,**實作時已推翻**:
   既然匯出是整包不挑,清除就該對稱地整包清,否則「搬了卻沒清」會留下上一個玩家的殘留 key。
   原本擔心的「clear 會讓在途的背景壓縮蓋掉新值」實測不成立——worker 回來會比對 `_lsGet(key)`
   是不是它記得的原值(`js/00-data.js:136`),對不上就自己 return。
3. 再逐 key `_lzSetStoredRaw` 寫入
4. `location.reload()`

入口掛在首頁 `#main-menu` 的設定選單(`afk-storage.js` 那顆「⚙ 其他功能」),**只在主選單開得到** → 天然避開「遊戲中還原 → 記憶體裡的舊 player 又被 saveGame 寫回去」。全程只碰 localStorage,不呼叫任何會寫存檔的原作函式。

### 體積(動手前要先量)

`.testdata/` 的單格匯出檔是 505~738 KB(**明文未壓縮**);localStorage 裡是 LZ1 壓縮態、約 1/10。16 格滿的玩家壓縮態總量可到 4~5 MB(`afk-quotawarn.js` 盯的就是 80% 門檻)。

要量三個數字(Playwright headless + `launchPersistentContext`,profile 用 `$env:TEMP` **短路徑**):localStorage 總字元數 → 打包成 JSON 的 UTF-8 bytes → 經 `CompressionStream('gzip')` 後的 bytes。這個數字決定雲端那半要不要分塊。

## 若之後選 Cloudflare(③ 或 ⑤)

已查證的平台限制(2026-07 官方文件):

| | 數字 |
|---|---|
| Workers 免費 | 每日 10 萬請求 / 每請求 **10ms CPU** / body 上限 100MB |
| D1 免費 | 資料庫 **500MB**、單筆 string·BLOB·row **2,000,000 bytes**、單一 SQL statement 文字 **100KB** |
| R2 免費 | 10GB,但**啟用需先新增付款方式** |
| KV | 最終一致性 → 「A 剛上傳、B 馬上輸碼」可能讀不到,**不適合**當轉移中轉 |

設計要點:

- **10ms CPU 是主要約束** → Worker 只做「收 binary 原樣塞進 D1」「讀出來原樣吐回」,不在 Worker 內做 base64/gzip 編解碼,回傳用 stream 逐塊寫出。
- 超過 2MB 要**分塊**:前端切 1MB/塊,一個 HTTP request 一塊、一次 invocation 只做 1 個 D1 query(避開免費方案 50 queries/invocation)。⚠️ **官方文件沒寫清楚 `.bind()` 的 blob 算不算進「SQL statement 100KB」那條**,實作時第一件事就是實測,撞到就把塊調小。
- CORS 要 `Access-Control-Allow-Origin: *`(不帶 cookie),`file://` 的 `Origin: null` 才過得了;OPTIONS 要回 `Access-Control-Allow-Headers: content-type`。
- 6 位數碼用 `crypto.getRandomValues`,`INSERT` 撞主鍵重試 5 次(不能因為「機率不高」就省掉,省掉就是玩家偶爾看到不明錯誤)。
- 防濫用(Worker 網址會出現在公開 repo):單包上限 8MB、同 IP 1 小時最多 5 次上傳、猜碼失敗 1 小時 20 次即封、驗 body 前兩個 byte 是 gzip magic `0x1f 0x8b`(零 CPU)。
- **文案要誠實**:資料若沒有真的刪,就不能寫「30 分鐘後自動刪除」,要照實寫保留政策。

## 若之後選 Google Drive(②)

- scope 用 `https://www.googleapis.com/auth/drive.file`(只能碰 app 自己建立的檔)。它是 Google 推薦拿來避開驗證審核的窄 scope,社群普遍靠它繞過「未驗證應用程式」警告 —— 但**沒有官方文件白紙黑字保證永遠不用驗證**,動手前要先建一個 OAuth Client 實測同意畫面長什麼樣。
- OAuth 的 Authorized JavaScript origins 只能填 https 網域(`https://pp771007.github.io`)→ **`file://` 玩家一個都用不到**,這是這條路的硬傷。
- 手機瀏覽器的 popup 阻擋要處理(可能得走 redirect 模式)。

## 新增外掛時的登記步驟

真的要做的話,新外掛(暫名 `afk-cloudsave.js`)除了本體還要動這些,漏一個 `/prepush` 會擋:

| 檔 | 改什麼 |
|---|---|
| `scripts/afk-plugin-block.html` | 加 `<script>` 行(排在 `afk-storage.js` 之後)+ 註解說明位置理由 |
| `index.html` | 補同一行(`?v=` 由 `scripts/stamp-code-versions.mjs` 補) |
| `scripts/smoke-hooks.mjs` | `need` 加 `'[AFK-cloudsave]'` |
| `docs/plugins.md` | 外掛表加一列 + 標題數字 +1 |

開關掛 `storage` 的子項(`parent:'storage'`)—— 入口就在它的選單裡,父關掉 = 入口消失 = 子真的失效,符合父子判準。彈窗照 `afk-storage.js:162-172` 的 `_layer` / `openModal` / `hideModal` / `closeModal` 三支模式,CSS 用自己注入的具名 class(Tailwind 是預建置的,動態拼 class 會安靜失效)。

## 已知風險

- **目標裝置空間不足**:還原時若對方瀏覽器配額較小會寫到一半失敗。「先刪再寫」已把峰值壓到最低;仍失敗就中止,此時該裝置處於半殘狀態 → 錯誤訊息要明講「請用同一個碼或檔案再匯入一次」。
- **不可逆**:整台覆蓋,靠警語 + 一次確認把關(不做強制自動備份,面板同一頁就有「匯出成檔案」可以自己先按)。
- **隱私**:上傳內容含角色名等存檔資料,走雲端就要在面板寫清楚保留多久、誰看得到。
