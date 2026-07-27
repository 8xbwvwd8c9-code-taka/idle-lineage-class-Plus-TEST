-- 崩潰回報資料表。欄位刻意只有數字與裝置型號：不存角色名稱、身分碼、存檔內容。
CREATE TABLE IF NOT EXISTS crash (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT,     -- 伺服器收到的時間(UTC)
  did      TEXT,     -- 匿名裝置碼(隨機產生·只為了看「是不是同一台一直當」與去重)
  ver      TEXT,     -- afk-blackbox.js 自己的 ?v=(認得出黑盒子被快取到舊版)
  app      TEXT,     -- 加掛版 semver(version.json 的 app·如 3.4.10)
  code_ver TEXT,     -- version.json 的 code：index.html＋全部外掛＋遊戲 js/css 的 sha ＝實際部署內容
  build    TEXT,     -- version.json 的 build(如 0726-1951)
  proto    TEXT,     -- https:/http:=從網站玩;file:=下載下來直接開 index.html(那邊讀不到 version.json→版本欄位會空)
  at       TEXT,     -- 當掉那次的啟動時間(玩家本地時間字串)
  ua       TEXT,
  ua_short TEXT,     -- 機型摘要(Android 機型名 / iPhone OS / 桌機瀏覽器)
  pwa      INTEGER,  -- 1=安裝成 APP 在跑
  how      TEXT,     -- gone=就這樣沒了 / auto-reload=APP 自己重載回來(白畫面跳回選角那個症狀)
  beats    INTEGER,  -- 撐了幾拍(×10 秒)
  mins     INTEGER,
  mu       INTEGER,  -- JS 記憶體用量 MB(⚠不含圖片解碼佔用)
  ml       INTEGER,  -- JS 記憶體上限 MB(手機通常 256~512·桌機 3500+)
  dom      INTEGER,
  img      INTEGER,  -- 頁面上的 img 元素數(圖片吃記憶體的旁證)
  imgmb    INTEGER,  -- 圖片解碼佔用估算MB(naturalW×naturalH×4)。iOS 沒有 mu/ml,這是那邊唯一的記憶體量化指標
  vfx      INTEGER,
  mob      INTEGER,
  log      INTEGER,
  tk       INTEGER,
  map      TEXT,
  view     TEXT,     -- ok / 主容器量到 0 或離屏(＝版面問題而非記憶體)
  ff       INTEGER,  -- 1=當下正在離線結算
  run      INTEGER,
  inv      INTEGER,  -- 背包件數(規模·非身分)
  ally     INTEGER,
  save_kb  INTEGER,
  dm       INTEGER,  -- navigator.deviceMemory(GB)
  cores    INTEGER,
  w        INTEGER,
  h        INTEGER,
  dpr      REAL,
  errs     TEXT
);
CREATE INDEX IF NOT EXISTS idx_crash_ts  ON crash(ts);
CREATE INDEX IF NOT EXISTS idx_crash_did ON crash(did);
CREATE INDEX IF NOT EXISTS idx_crash_ua  ON crash(ua_short);
