# 崩潰回報收集器

收 `afk-blackbox.js` 在「玩家下次啟動」補送的當掉快照，寫進 Cloudflare D1。

崩潰當下什麼都送不出去（頁面已經沒了），所以一律是**下一次開遊戲時**把上一筆補送。玩家不必做任何事。

## 只收這些

記憶體水位、DOM／圖片／特效／怪卡／日誌數量、地圖 id、tick、螢幕尺寸、裝置型號（UA）、背包與傭兵**件數**、存檔 KB、錯誤訊息，加一組隨機裝置碼（看是不是同一台一直當）。

**不含**角色名稱、角色身分碼、寵物歸屬、倉庫內容。查白畫面用不到這些。

玩家可在遊戲的外掛開關面板關掉「當掉時自動回報」（預設開）。

## 已部署（2026-07-27）

端點：`https://crash-collector.pp771007.workers.dev`（已填進 `afk-blackbox.js` 的 `REPORT_URL`）
D1：`idle-crash`　金鑰：`wrangler secret put VIEW_KEY` 設定，**不在版控裡**。

要重建或換帳號時：

```bash
cd cf-crash-collector
npx wrangler d1 create idle-crash          # 把印出的 database_id 填進 wrangler.toml
npx wrangler d1 execute idle-crash --remote --file=./schema.sql
npx wrangler secret put VIEW_KEY
npx wrangler deploy
```

> `REPORT_URL` 留空時整套回報不會啟用、完全不連外。

## 看資料

```
https://crash-collector.pp771007.workers.dev/data?k=你的VIEW_KEY        （預設明細 200 筆）
https://crash-collector.pp771007.workers.dev/data?k=你的VIEW_KEY&n=500  （調筆數，上限 1000）
```

**刻意不做網頁介面**——這份資料是要整包貼給 AI 判讀的，所以回應自帶「怎麼判讀」與「欄位」說明，
拿到就能直接分析，不必另外解釋 schema。內容包含：總覽、依機型統計（含 `記憶體用量比`、`版面異常次數`）、明細。

判讀重點（回應裡也有一份）：

- `ml`（記憶體上限）手機通常 256~512 MB、桌機 3500+。`mu/ml` ≥ 0.85 → JS 記憶體吃爆。
- `mu` 不高但 `img` 很大 → 兇手是**圖片解碼佔用**（`performance.memory` 量不到那塊），方向是減少同時存在的怪物動畫圖。
- `view` 不是 `ok` → 根本不是記憶體，是版面把畫面推走了。
- `how = auto-reload` → 就是玩家回報的「白畫面跳回選角」。
- 同一個 `did` 反覆出現 → 同一台一直當，不是普遍現象。

## 費用

Workers 免費方案每天 10 萬次請求、D1 免費方案每天 500 萬列讀取 / 10 萬列寫入。
一筆當掉才送一次，以本站玩家量遠在免費額度內。
