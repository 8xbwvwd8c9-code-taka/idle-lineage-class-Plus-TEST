/* ============================================================================
 * afk-blackbox.js — 崩潰黑盒子（白畫面／分頁被系統殺掉的事後取證）
 *
 * 為什麼需要這支：玩家回報「玩一分鐘畫面全白」時，頁面當下已經死了——快取診斷是
 * 「開得起來才看得到」的東西，白屏當下根本打不開；事後重開又只剩乾淨狀態，什麼都查不到。
 * 所以改成黑盒子：平常低頻記一筆「我還活著＋當下的量測值」，下次啟動時若發現上次沒有
 * 正常收尾，就把最後那筆快照留下來給 afk-diag 顯示。玩家只要事後開一次診斷就能交出證據。
 *
 * 三種死法在快照裡長得不一樣，這是本外掛的全部價值：
 *   ① 分頁被系統回收(OOM)  → 心跳停在最後一筆，mu(已用堆) 逼近 ml(上限)，dom/vfx 可能同時偏高
 *   ② JS 例外打斷          → err 有東西，心跳通常還在跑（頁面沒死，只是遊戲停了）
 *   ③ 版面把畫面推走       → 心跳照跑，但 view 記到 #app-stage / #game-screen 量到 0 或整個離屏
 * 三者的處置方向完全不同（省記憶體／修例外／修 CSS），沒有這份快照只能瞎猜。
 *
 * 🚨 不可以寫 localStorage：那 5MB 是存檔的地盤、本來就吃緊（afk-quotawarn 在盯 80% 門檻），
 * 診斷資料絕不能變成「害玩家存檔存不進去」的新佔用來源。改用 IndexedDB——走 navigator.storage
 * 的大配額（跟 localStorage 完全分開）、而且寫入非同步不阻塞主執行緒，對效能反而比 localStorage 好。
 *
 * 成本：預設 10 秒一次；補跑期間(state.ff)整段跳過（結算已經夠忙，不再加負擔）。
 * 欄位以 childElementCount 這種 O(1) 讀取為主，只有「DOM 節點總數」是 O(n)（實測數千節點約 1ms，
 * 10 秒一次可忽略）。保留最近 KEEP 筆就滾掉，資料量恆定。
 * ========================================================================== */
(function () {
  'use strict';

  if (window.AFK_TOGGLES) {
    AFK_TOGGLES.register({
      id: 'blackbox', name: '崩潰黑盒子', group: '系統與其他', def: true,
      desc: '背景低頻記錄畫面與記憶體狀態；若遊戲當掉/畫面全白，下次可在「快取診斷」看到當掉前的最後狀態'
    });
    if (!AFK_TOGGLES.enabled('blackbox')) return;
  }

  var DB_NAME = 'afk-blackbox', STORE = 'rec', DB_VER = 1;
  var HEARTBEAT_MS = 10000;   // 心跳間隔。調小不會讓證據變準，只會多寫幾筆——維持 10 秒
  var KEEP = 6;               // 保留最近幾次啟動的紀錄（看得到「連續多次異常」這種模式）
  var ERR_MAX = 3;            // 單次啟動最多留幾則不同的錯誤訊息
  var VIEW_MIN_PX = 50;       // 主容器小於這個尺寸就當作「畫面被壓掉了」

  // ── IndexedDB 極簡包裝（只有 put / getAll，夠用就好） ────────────────────
  var _db = null, _dbFail = false;
  function db(cb) {
    if (_dbFail) return;
    if (_db) return cb(_db);
    var rq;
    try { rq = indexedDB.open(DB_NAME, DB_VER); } catch (e) { _dbFail = true; return; }
    rq.onupgradeneeded = function () {
      var d = rq.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
    };
    rq.onsuccess = function () { _db = rq.result; cb(_db); };
    rq.onerror = function () { _dbFail = true; };   // 無痕模式/配額拒絕 → 安靜停用，不可弄壞遊戲
  }
  function put(rec) {
    db(function (d) {
      try {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
      } catch (e) { /* 交易開不起來就算了，黑盒子不值得為自己冒任何風險 */ }
    });
  }
  function getAll(cb) {
    db(function (d) {
      try {
        var rq = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        rq.onsuccess = function () { cb(rq.result || []); };
        rq.onerror = function () { cb([]); };
      } catch (e) { cb([]); }
    });
  }
  function del(ids) {
    if (!ids.length) return;
    db(function (d) {
      try {
        var os = d.transaction(STORE, 'readwrite').objectStore(STORE);
        ids.forEach(function (id) { os.delete(id); });
      } catch (e) {}
    });
  }

  // ── 量測 ────────────────────────────────────────────────────────────────
  function cnt(id) { var el = document.getElementById(id); return el ? el.childElementCount : -1; }

  // 「畫面還在不在」——白屏的直接證據。主容器被壓成 0 或整個推出視窗，就是版面出事（不是 OOM）。
  function viewHealth() {
    var bad = [];
    ['app-stage', 'game-screen'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.classList.contains('hidden')) return;   // 不在該畫面(如選角)→本來就不該量
      var w = el.clientWidth, h = el.clientHeight;
      if (w < VIEW_MIN_PX || h < VIEW_MIN_PX) { bad.push(id + '=' + w + 'x' + h); return; }
      var r = el.getBoundingClientRect();
      if (r.bottom < 20 || r.right < 20 || r.top > innerHeight - 20 || r.left > innerWidth - 20)
        bad.push(id + '離屏(top' + Math.round(r.top) + ',left' + Math.round(r.left) + ')');
    });
    return bad.length ? bad.join(' ') : 'ok';
  }

  function snap() {
    var o = {};
    var ff = false;
    try { ff = !!(window.state && state.ff); } catch (e) {}
    if (ff) o.ff = 1;
    try {
      var m = performance.memory;
      if (m) { o.mu = Math.round(m.usedJSHeapSize / 1048576); o.ml = Math.round(m.jsHeapSizeLimit / 1048576); }
    } catch (e) {}
    // 唯一的 O(n) 欄位 → 離線補跑期間跳過（那段最忙）。記憶體水位是 O(1)，照量：
    //   結算正是記憶體高峰，整段不記等於把最可疑的一段變成盲區。
    try { if (!ff) o.dom = document.getElementsByTagName('*').length; } catch (e) {}
    try { o.vfx = cnt('vfx-layer'); o.mob = cnt('mob-list'); o.log = cnt('combat-log') + cnt('sys-log'); } catch (e) {}
    try { if (window.state) { o.tk = state.ticks; o.run = state.running ? 1 : 0; } } catch (e) {}
    try { if (window.mapState) o.map = String(mapState.current || '').slice(0, 24); } catch (e) {}
    try { o.view = viewHealth(); } catch (e) { o.view = '?'; }
    return o;
  }

  // ── 本次啟動的紀錄 ──────────────────────────────────────────────────────
  var ID = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  var rec = {
    id: ID,
    t0: new Date().toLocaleString('zh-TW'),
    ua: (navigator.userAgent || '').slice(0, 120),
    beats: 0,          // 撐了幾拍（× HEARTBEAT_MS ≈ 活了多久）
    clean: 0,          // 有沒有正常收尾。0 而且 last 有東西 = 上次是「突然」沒的
    errs: [],
    last: null         // 最後一次心跳的快照＝死前狀態
  };

  function flush() { rec.last = snap(); put(rec); }

  function pushErr(msg) {
    msg = String(msg || '').slice(0, 160);
    if (!msg) return;
    for (var i = 0; i < rec.errs.length; i++) {
      if (rec.errs[i].m === msg) { rec.errs[i].n++; return; }   // 同一則錯誤每 tick 洗版 → 只記次數
    }
    if (rec.errs.length >= ERR_MAX) return;
    rec.errs.push({ m: msg, n: 1, at: new Date().toLocaleTimeString('zh-TW') });
    flush();   // 錯誤可能是死因，立刻落地，不等下一拍
  }

  window.addEventListener('error', function (e) {
    pushErr((e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    pushErr('Promise未捕捉: ' + String((r && r.message) || r || ''));
  });

  // 「安全收尾點」＝頁面被隱藏的那一刻（切走／準備關閉）。此時頁面還活著，IndexedDB 寫得進去。
  //   ⚠ 不能只靠 pagehide：那時寫入常常來不及提交，於是每次正常關閉都被記成崩潰——假警報一多，
  //   真的當掉就淹沒在裡面了（實測 reload 100% 誤判）。改成 hidden 時先落地，pagehide 只當補刀。
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { rec.clean = 1; rec.vis = 'hidden'; }
    else { rec.clean = 0; rec.vis = 'visible'; }   // 又切回來玩 → 重新開始算「前景突然沒了」
    flush();
  });
  ['pagehide', 'beforeunload'].forEach(function (ev) {
    window.addEventListener(ev, function () { rec.clean = 1; rec.last = snap(); put(rec); });
  });

  setInterval(function () {
    try {
      if (document.hidden) return;   // 背景分頁沒人看，不必記（也省下背景寫入）
      rec.beats++;
      flush();
    } catch (e) {}
  }, HEARTBEAT_MS);

  // ── 開機：撈上次的紀錄，順手滾掉舊的 ────────────────────────────────────
  var NAV = '';
  try { var _n = performance.getEntriesByType('navigation')[0]; NAV = _n ? _n.type : ''; } catch (e) {}

  var PREV = null;
  getAll(function (all) {
    var old = all.filter(function (r) { return r.id !== ID; })
                 .sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });
    PREV = old[0] || null;
    // 玩家自己按「重新整理」時只會觸發 pagehide、不會觸發 visibilitychange → 收尾標記常寫不進去，
    //   上一筆就長得跟「突然當掉」一模一樣。本次是 reload 進來的話就把上一筆註記起來，
    //   否則每重整一次就多一筆假警報，真正的當掉會被淹沒。
    if (PREV && !PREV.clean && NAV === 'reload') { PREV.reloaded = 1; put(PREV); }
    if (old.length > KEEP) del(old.slice(KEEP).map(function (r) { return r.id; }));
  });
  flush();

  // afk-diag 讀這裡（唯讀，不讓它碰寫入）
  window.AFK_BLACKBOX = {
    prev: function () { return PREV; },
    all: function (cb) { getAll(function (a) { cb(a.filter(function (r) { return r.id !== ID; })); }); },
    now: function () { return snap(); },
    beatMs: HEARTBEAT_MS
  };

  console.log('[AFK-blackbox] hooks OK — 崩潰黑盒子已啟用(IndexedDB，不佔存檔空間)。');
})();
