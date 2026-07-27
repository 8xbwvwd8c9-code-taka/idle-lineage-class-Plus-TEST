# 崩潰回報收集器

收 `afk-blackbox.js` 在「玩家下次啟動」補送的當掉快照，寫進 Cloudflare D1。

崩潰當下什麼都送不出去（頁面已經沒了），所以一律是**下一次開遊戲時**把上一筆補送。玩家不必做任何事。

## 只收這些

記憶體水位、DOM／圖片／特效／怪卡／日誌數量、地圖 id、tick、螢幕尺寸、裝置型號（UA）、背包與傭兵**件數**、存檔 KB、錯誤訊息，加一組隨機裝置碼（看是不是同一台一直當）。

**不含**角色名稱、角色身分碼、寵物歸屬、倉庫內容。查白畫面用不到這些。

玩家可在遊戲的外掛開關面板關掉「當掉時自動回報」（預設開）。

## 部署（只需做一次）

```bash
cd cf-crash-collector
npx wrangler d1 create idle-crash          # 把印出的 database_id 填進 wrangler.toml
npx wrangler d1 execute idle-crash --remote --file=./schema.sql
npx wrangler secret put VIEW_KEY           # 自己設一組看資料用的密碼
npx wrangler deploy
```

部署完會給一個 `https://crash-collector.<你的帳號>.workers.dev` 網址。
**把它填進 `afk-blackbox.js` 最上面的 `REPORT_URL`**，然後照常 `/prepush` 上線。

> `REPORT_URL` 留空時整套回報不會啟用、完全不連外——端點還沒好之前推上線也不會有任何影響。

## 看資料

```
https://crash-collector.<帳號>.workers.dev/list?k=你的VIEW_KEY     最近 200 筆
https://crash-collector.<帳號>.workers.dev/stats?k=你的VIEW_KEY    依機型聚合
```

`/stats` 直接回答關鍵問題：**哪個機型在當、當的時候 JS 記憶體多少、上限多少、圖片幾張、撐了幾分鐘**。

判讀重點：

- `ml`（記憶體上限）手機通常 256~512 MB、桌機 3500+。`mu/ml` 逼近 1 → JS 記憶體吃爆。
- `mu` 不高但 `img` 很大 → 兇手是**圖片解碼佔用**（`performance.memory` 量不到那塊），方向是減少同時存在的怪物動畫圖。
- `view` 不是 `ok` → 根本不是記憶體，是版面把畫面推走了。
- `how = auto-reload` → 就是玩家回報的「白畫面跳回選角」。

## 費用

Workers 免費方案每天 10 萬次請求、D1 免費方案每天 500 萬列讀取 / 10 萬列寫入。
一筆當掉才送一次，以本站玩家量遠在免費額度內。
