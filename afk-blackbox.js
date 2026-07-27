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
    // 子選項:父項關掉＝沒有紀錄可送,回報自然失效 → 符合做父子的條件
    AFK_TOGGLES.register({
      id: 'crashreport', parent: 'blackbox', name: '當掉時自動回報', group: '系統與其他', def: true,
      desc: '偵測到上次是「玩到一半突然當掉」時，把當掉前的記憶體/畫面數據回報給維護者。只送這些數字與裝置型號，不含角色名稱、身分碼或存檔內容'
    });
    if (!AFK_TOGGLES.enabled('blackbox')) return;
  }

  // 崩潰回報端點。空字串＝只在本機留紀錄、完全不連外(端點還沒部署時就是這個狀態)。
  var REPORT_URL = 'https://crash-collector.pp771007.workers.dev';
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
  // 回 null＝這台根本存不了(直接開檔案玩／無痕／瀏覽器擋)。要跟「存得了但沒紀錄」分開,
  //   否則報告看起來一樣空,分不出「沒當過」還是「根本沒在記」。
  function getAll(cb) {
    var done = false;
    var fin = function (v) { if (!done) { done = true; cb(v); } };
    setTimeout(function () { fin(null); }, 2500);
    db(function (d) {
      try {
        var rq = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        rq.onsuccess = function () { fin(rq.result || []); };
        rq.onerror = function () { fin(null); };
      } catch (e) { fin(null); }
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
    // 本來以為這條是 O(n)、想在補跑期間跳過，實測(2026-07-27·Lv97 存檔·DOM 3189 節點)單獨量
    //   是 0.0000 ms —— live HTMLCollection 的 length 不必遍歷。既然不貴就照記，
    //   不然結算期間少一個關鍵欄位卻什麼也沒省到。整次快照約 0.0155 ms。
    try { o.dom = document.getElementsByTagName('*').length; } catch (e) {}
    // ⚠ mu/ml 只涵蓋 JS 記憶體,**不含圖片解碼後佔的原生記憶體**——而手機上真正吃掉記憶體的
    //   多半是怪物動畫/特效那幾百張圖(js/09 有 24 處在建 img)。只看 mu 會得到「記憶體很正常」
    //   的錯誤結論,所以另外記圖片元素數量當旁證。document.images 是 live collection,取 length 不必遍歷。
    try { o.img = document.images.length; } catch (e) {}
    try { o.vfx = cnt('vfx-layer'); o.mob = cnt('mob-list'); o.log = cnt('combat-log') + cnt('sys-log'); } catch (e) {}
    try { if (window.state) { o.tk = state.ticks; o.run = state.running ? 1 : 0; } } catch (e) {}
    // 規模(不是身分):背包/傭兵件數直接決定 DOM 與記憶體,是「大存檔才崩」這個假設的驗證依據。
    //   兩個都是陣列長度 O(1);倉庫件數要解壓所以不在這裡量(上傳前才算存檔大小)。
    try { if (window.player) { o.inv = (player.inv || []).length; o.ally = (player.allies || []).length; } } catch (e) {}
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

  // ── 自動回報 ────────────────────────────────────────────────────────────
  //   崩潰當下什麼都送不出去(頁面已經沒了)→ 一律等「下次啟動」補送上一筆。
  //   只送數字與裝置型號:不含角色名稱/身分碼/存檔內容——查白畫面只需要記憶體與畫面規模，
  //   帶身分資料既沒幫助又是在蒐集玩家資料。
  var META_ID = '__meta';
  var CODE_VER = (function () {   // 比照 afk-diag:從自己的 <script src ?v=> 取內容 sha 當程式版本
    try {
      var s = document.querySelector('script[src*="afk-blackbox.js"]');
      var m = s && s.getAttribute('src').match(/[?&]v=([^&]+)/);
      return m ? m[1] : '';
    } catch (e) { return ''; }
  })();
  function reportOn() {
    if (!REPORT_URL) return false;
    // 直接開 index.html 檔案玩的不回報：那份是玩家當初下載、之後不會更新的凍結版本，
    //   混進來會讓「哪一版在當」對不上而誤導判讀（CORS 對 file:// 的 null origin 也未必放行）。
    //   本機紀錄照留 → 想幫忙的玩家仍可自己開診斷、下載檔案給我們。
    if (location.protocol === 'file:') return false;
    if (window.AFK_TOGGLES && !AFK_TOGGLES.enabled('crashreport')) return false;
    return true;
  }
  function saveKB() {   // 存檔佔用(KB)。只在要送的時候算一次,不進心跳。
    try {
      var n = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('lineage_idle_save_') === 0) n += (localStorage.getItem(k) || '').length * 2;
      }
      return Math.round(n / 1024);
    } catch (e) { return -1; }
  }
  function send(r, did) {
    // 先問 version.json 拿整包版本(app/code/build)——單支 afk-blackbox.js 的 ?v= 只認得出那一支，
    //   而 code 是「index.html＋全部外掛＋遊戲 js/css」的 sha，才定位得到玩家實際跑的是哪一版。
    //   讀不到就照送，版本欄位留空總比不回報好。
    fetch('version.json', { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .catch(function () { return null; })
      .then(function (v) { postIt(r, did, v || {}); });
  }
  function postIt(r, did, v) {
    var L = r.last || {};
    var body = {
      v: 1, did: did, at: r.t0, ua: r.ua, pwa: r.pwa || 0,
      how: r.autoReload ? 'auto-reload' : 'gone',   // APP 自己重載回來 vs 就這樣沒了
      beats: r.beats, mins: Math.round(r.beats * HEARTBEAT_MS / 60000),
      mu: L.mu, ml: L.ml, dom: L.dom, img: L.img, vfx: L.vfx, mob: L.mob, log: L.log,
      tk: L.tk, map: L.map, view: L.view, ff: L.ff || 0, run: L.run || 0,
      inv: L.inv, ally: L.ally, saveKB: saveKB(),
      errs: (r.errs || []).slice(0, 3),
      ver: CODE_VER,                 // 這支外掛自己的 ?v=(認得出黑盒子被快取到舊版的情況)
      app: v.app || '', code: v.code || '', build: v.build || '',   // 整包版本(version.json)
      dm: (navigator.deviceMemory || 0), cores: (navigator.hardwareConcurrency || 0),
      w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1
    };
    // 送不出去(離線/端點掛了)就維持未標記,下次啟動再試——不重試、不排隊,失敗完全無感。
    fetch(REPORT_URL, {
      method: 'POST', mode: 'cors', keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (res && res.ok) { r.sent = 1; put(r); }
    }).catch(function () {});
  }

  // ── 開機：撈上次的紀錄，順手滾掉舊的 ────────────────────────────────────
  var NAV = '';
  try { var _n = performance.getEntriesByType('navigation')[0]; NAV = _n ? _n.type : ''; } catch (e) {}
  var STANDALONE = false;   // 安裝成 APP(PWA)在跑？影響下面怎麼解讀 reload
  try { STANDALONE = !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone); } catch (e) {}
  rec.pwa = STANDALONE ? 1 : 0;

  var PREV = null;
  getAll(function (all) {
    if (!all) return;   // 這台存不了(直接開檔案玩/無痕/被擋)→ 安靜放棄，不影響遊戲
    var meta = null;
    all.forEach(function (r) { if (r.id === META_ID) meta = r; });
    var old = all.filter(function (r) { return r.id !== ID && r.id !== META_ID; })
                 .sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); });
    PREV = old[0] || null;
    // 玩家自己按「重新整理」時只會觸發 pagehide、不會觸發 visibilitychange → 收尾標記常寫不進去，
    //   上一筆就長得跟「突然當掉」一模一樣。本次是 reload 進來的話就把上一筆註記起來，
    //   否則每重整一次就多一筆假警報，真正的當掉會被淹沒。
    // 🚨 但「安裝成 APP(PWA)」時不可以這樣消音：standalone 沒有網址列、沒有重整鈕，玩家根本按不到，
    //   而「畫面白掉→自己回到選角」正是 renderer 被系統回收後 PWA 自動重載 —— 那也是 type='reload'。
    //   在 PWA 下把 reload 當成「玩家自己重整」，等於把真正要抓的當掉整個洗掉。
    if (PREV && !PREV.clean && NAV === 'reload' && !STANDALONE) { PREV.reloaded = 1; put(PREV); }
    if (PREV && !PREV.clean && NAV === 'reload' && STANDALONE) { PREV.autoReload = 1; put(PREV); }
    if (old.length > KEEP) del(old.slice(KEEP).map(function (r) { return r.id; }));

    // 上一次是「玩到一半突然沒了」且還沒送過 → 現在補送(玩家自己重整的那種不送)
    if (reportOn() && PREV && !PREV.clean && !PREV.reloaded && !PREV.sent) {
      var did = meta && meta.did;
      if (!did) {   // 匿名裝置碼:只用來看「是不是同一台一直當」與去重,不含任何個人資訊
        did = 'd' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
        put({ id: META_ID, did: did });
      }
      try { send(PREV, did); } catch (e) {}
    }
  });
  flush();

  // afk-diag 讀這裡（唯讀，不讓它碰寫入）
  window.AFK_BLACKBOX = {
    prev: function () { return PREV; },
    all: function (cb) { getAll(function (a) { cb(a && a.filter(function (r) { return r.id !== ID && r.id !== META_ID; })); }); },
    now: function () { return snap(); },
    beatMs: HEARTBEAT_MS
  };

  console.log('[AFK-blackbox] hooks OK — 崩潰黑盒子已啟用(IndexedDB，不佔存檔空間)。');
})();
