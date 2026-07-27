/* ============================================================================
 * 崩潰回報收集器 —— 收 afk-blackbox 在「下次啟動」補送的當掉快照，寫進 D1。
 *
 * 只收數字與裝置型號：記憶體、DOM/圖片/特效數量、地圖 id、tick、螢幕、UA、匿名裝置碼。
 * 不含角色名稱、身分碼、存檔內容——查白畫面用不到，帶了只是在蒐集玩家資料。
 *
 * 端點：
 *   POST /             收一筆回報（給遊戲用，公開）
 *   GET  /data?k=金鑰  取回完整資料。刻意不做網頁介面——這份是要整包貼給 AI 判讀的，
 *                      所以回傳自帶欄位說明與判準（GUIDE），拿到就能分析。?n= 可調明細筆數(預設 200)。
 * 金鑰用 wrangler secret put VIEW_KEY 設定；沒設就一律拒絕讀取端點。
 * ========================================================================== */

const CORS = {
  'access-control-allow-origin': '*',            // 玩家可能從 GitHub Pages 或 file:// 開，一律放行
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS } });

const MAX_BODY = 8 * 1024;   // 一筆快照只有幾百 bytes，超過就是不對勁

// 2026-07-27 最早兩版的 afk-blackbox.js：用 window.state 讀核心變數(核心是頂層 let、不掛 window)，
//   map/tk/run/inv/ally/ff 一律空 → 統計要排除，否則「戰鬥中佔比」全被拉歪。
//   明細仍照給(dom/img/beats/how 那些是有效的，是目前唯一的問題規模基線)。
// ⚠ 判準看「資料本身有沒有 map」，不能看 ver——ver 是**送出當下**的版本，而快照是**上一次 session**
//   記的，玩家更新後第一次回報就會是「新 ver ＋ 舊快照」。

// 只留白名單欄位，且各自限型別/長度——別人亂送東西進來也不會把資料表撐爆
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const int = (v) => (Number.isFinite(v) ? Math.trunc(v) : null);

// 這份資料是要整包貼給 AI 判讀的，所以自帶欄位說明與判準——拿到就能分析，不必另外解釋 schema。
const GUIDE = {
  這是什麼: '放置天堂(加掛版)的當掉回報。玩家「玩到一半畫面突然沒了」時，由 afk-blackbox 在下一次啟動補送當掉前最後一筆快照。',
  怎麼判讀: [
    '🍎 iPhone 是本案的重災區(回報幾乎都是 iOS)，而 Safari 沒有 performance.memory → mu/ml 一律 null。' +
      '看到 mu/ml 是 null 就走 iOS 判讀路徑：改看 imgmb(圖片解碼佔用估算) 與 dom。' +
      'iOS 對單一分頁有硬性記憶體上限(iPhone 約 200~400MB 視機型)，而且「圖片解碼後的點陣圖」也算進去，超過直接砍掉分頁 → 畫面瞬間全白、PWA 隨即自動重載(how=auto-reload)。',
    'mu/ml 是 JS 記憶體的用量與上限(MB)。比值 >= 0.85 → JS 記憶體吃爆，方向是減少 JS 物件。',
    '⚠ mu 不含圖片解碼佔用。若 mu 比值不高但 img/imgmb 很大 → 兇手是圖片記憶體，方向是減少同時存在的怪物動畫/特效圖。',
    'imgmb = 所有 <img> 的 naturalWidth×naturalHeight×4bytes 估算值(MB)。⚠ 只涵蓋 <img>、不含 CSS 背景圖，所以是低估；' +
      '參考值：桌機 zone_09 戰鬥中約 295 張圖 ≈ 14MB。若玩家當掉時明顯高於這個量級，圖片就是主嫌。',
    'ml 可反推裝置等級：手機通常 256~512、桌機 3500+。ml 小又常當 = 低階機專屬問題。',
    'view 不是 ok → 主容器被量到 0 或整個離屏，那是版面(CSS)問題，跟記憶體無關，別往記憶體查。',
    'how=auto-reload 代表 APP 自己重載回來(玩家看到的是「畫面白掉→跳回選角」)；how=gone 代表就這樣沒了。',
    'ff=1 代表當下正在跑離線結算，那段是記憶體高峰。',
    'inv/save_kb 是存檔規模，用來驗證「是不是大存檔才當」。',
    'did 是匿名裝置碼：同一個 did 反覆出現 = 同一台一直當，不是普遍現象。',
  ],
  欄位: {
    ts: '伺服器收到時間(UTC)', at: '當掉那次的啟動時間(玩家本地)', mins: '那次撐了幾分鐘',
    ua_short: '機型摘要', pwa: '1=安裝成APP在跑', how: 'gone|auto-reload',
    mu: 'JS記憶體用量MB(不含圖片)', ml: 'JS記憶體上限MB', dom: 'DOM節點數', img: '頁面img元素數', imgmb: '圖片解碼佔用估算MB(iOS 沒有 mu/ml 時的替代指標)',
    vfx: '特效層子元素數', mob: '怪卡數', log: '日誌行數', tk: '遊戲tick', map: '地圖id',
    view: 'ok 或 版面異常描述', ff: '1=離線結算中', inv: '背包件數', ally: '傭兵數',
    save_kb: '存檔KB', dm: '裝置記憶體GB', cores: 'CPU核數', w: '視窗寬', h: '視窗高', dpr: '像素密度',
    errs: '當掉前抓到的JS錯誤', did: '匿名裝置碼',
    app: '加掛版版本號(如 3.4.10)', code_ver: '實際部署內容的 sha(index.html＋全部外掛＋遊戲js/css)', build: '建置時間(如 0726-1951)',
    ver: 'afk-blackbox.js 自己的 ?v=(跟 code_ver 對不起來 = 那支被快取到舊版)',
    proto: '玩家怎麼開的：https:/http: = 從網站玩；file: = 把整包下載下來直接開 index.html 玩',
  },
  版本怎麼看: 'code_ver 才是「玩家實際跑的是哪一版」的依據(app 只是人看的 semver、同一版可能重建過)。當掉集中在某個 code_ver → 是那次改版引入的。⚠ proto=file: 的那些讀不到 version.json(瀏覽器擋 file:// 的 fetch)，所以 app/code_ver/build 會是空的，只能用 ver(afk-blackbox.js 的內容 sha)去 git 反查是哪一版；而且他們跑的是下載當下凍結的版本，不會隨網站更新，判斷「這版修好了沒」時要把他們排除。',
  沒有收集: '角色名稱、角色身分碼、寵物歸屬、倉庫內容都不會送，查白畫面用不到。',
  '⚠️已知資料缺陷': 'code_ver 是 code-9b50193a7793 或 code-281644a8f2db 的那批(2026-07-27 最早兩版)，' +
    'map/tk/run/inv/ally/ff 一律是空值或 0 —— 那是回報端的 bug(用 window.state 讀核心變數，但核心是頂層 let 宣告、不掛 window)，' +
    '**不代表玩家真的在選角畫面、也不代表沒在戰鬥**。判讀那批只能用 dom/img/beats/how/save_kb；' +
    '同一批的 dom≈3500、img≈240 其實正是「戰鬥中」的量級(選角畫面約 600)。之後的版本已修正。',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // 整包交給 AI 判讀:說明＋判準＋統計＋明細一次給齊,直接貼進對話就能分析
    if (req.method === 'GET' && url.pathname === '/data') {
      if (!env.VIEW_KEY || url.searchParams.get('k') !== env.VIEW_KEY) return json({ err: 'nope' }, 403);
      const lim = Math.min(parseInt(url.searchParams.get('n') || '200', 10) || 200, 1000);
      const [tot, bad, stats, rows] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) c, COUNT(DISTINCT did) d, MIN(ts) f, MAX(ts) l FROM crash').first(),
        env.DB.prepare('SELECT COUNT(*) c FROM crash WHERE map IS NULL').first(),
        env.DB.prepare(`SELECT ua_short 機型, COUNT(*) 次數, COUNT(DISTINCT did) 幾台,
                               ROUND(AVG(mu)) 平均mu, ROUND(AVG(ml)) 平均ml,
                               ROUND(AVG(CASE WHEN ml>0 THEN 1.0*mu/ml END),3) 記憶體用量比,
                               ROUND(AVG(img)) 平均img, ROUND(AVG(imgmb)) 平均imgmb, ROUND(AVG(dom)) 平均dom,
                               ROUND(AVG(mins),1) 平均撐幾分,
                               SUM(CASE WHEN run=1 THEN 1 ELSE 0 END) 戰鬥中次數,
                               SUM(CASE WHEN ff=1 THEN 1 ELSE 0 END) 離線結算中次數,
                               SUM(CASE WHEN view<>'ok' THEN 1 ELSE 0 END) 版面異常次數
                        FROM crash WHERE map IS NOT NULL GROUP BY ua_short ORDER BY 次數 DESC LIMIT 50`).all(),
        env.DB.prepare(`SELECT * FROM crash ORDER BY id DESC LIMIT ?`).bind(lim).all(),
      ]);
      return json({
        ...GUIDE,
        總覽: {
          總筆數: tot?.c ?? 0, 不同裝置數: tot?.d ?? 0, 最早: tot?.f, 最新: tot?.l,
          本次回傳明細筆數: rows.results.length,
          舊版缺欄位筆數: bad?.c ?? 0,
          '註': '「依機型統計」已排除舊版缺欄位那批(見 ⚠️已知資料缺陷)；明細仍含全部，那批的 dom/img/beats/how 是有效的。',
        },
        依機型統計_已排除缺陷版本: stats.results,
        明細: rows.results,
      });
    }

    if (req.method !== 'POST') return json({ ok: 1, 用法: 'GET /data?k=金鑰 取回可直接判讀的完整資料' });

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ err: 'too big' }, 413);
    let b;
    try { b = JSON.parse(raw); } catch { return json({ err: 'bad json' }, 400); }
    if (!b || b.v !== 1) return json({ err: 'bad version' }, 400);

    const ua = str(b.ua, 200) || '';
    // 機型摘要：Android 機型名 / iPhone / 桌機瀏覽器，聚合統計看這欄就夠
    let uaShort = 'other';
    let m;
    if ((m = ua.match(/Android [\d.]+; ([^;)]+)/))) uaShort = 'Android ' + m[1].trim().slice(0, 40);
    else if (/iPhone|iPad/.test(ua)) uaShort = (ua.match(/iPhone|iPad/) || ['iOS'])[0] + ' ' + ((ua.match(/OS (\d+)/) || [])[1] || '?');
    else if ((m = ua.match(/(Edg|OPR|SamsungBrowser|Firefox|Chrome)\/(\d+)/))) uaShort = m[1] + ' ' + m[2];

    await env.DB.prepare(
      `INSERT INTO crash (ts, did, ver, app, code_ver, build, proto, at, ua, ua_short, pwa, how, beats, mins,
                          mu, ml, dom, img, imgmb, vfx, mob, log, tk, map, view, ff, run,
                          inv, ally, save_kb, dm, cores, w, h, dpr, errs)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      new Date().toISOString(), str(b.did, 32), str(b.ver, 24),
      str(b.app, 24), str(b.code, 32), str(b.build, 24), str(b.proto, 12),
      str(b.at, 40), ua, uaShort,
      int(b.pwa), str(b.how, 16), int(b.beats), int(b.mins),
      int(b.mu), int(b.ml), int(b.dom), int(b.img), int(b.imgmb), int(b.vfx), int(b.mob), int(b.log),
      int(b.tk), str(b.map, 40), str(b.view, 120), int(b.ff), int(b.run),
      int(b.inv), int(b.ally), int(b.saveKB), int(b.dm), int(b.cores),
      int(b.w), int(b.h), Number.isFinite(b.dpr) ? b.dpr : null,
      JSON.stringify(Array.isArray(b.errs) ? b.errs.slice(0, 3) : []).slice(0, 1000)
    ).run();

    return json({ ok: 1 });
  },
};
