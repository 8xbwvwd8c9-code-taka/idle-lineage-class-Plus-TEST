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

// 只留白名單欄位，且各自限型別/長度——別人亂送東西進來也不會把資料表撐爆
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);
const int = (v) => (Number.isFinite(v) ? Math.trunc(v) : null);

// 這份資料是要整包貼給 AI 判讀的，所以自帶欄位說明與判準——拿到就能分析，不必另外解釋 schema。
const GUIDE = {
  這是什麼: '放置天堂(加掛版)的當掉回報。玩家「玩到一半畫面突然沒了」時，由 afk-blackbox 在下一次啟動補送當掉前最後一筆快照。',
  怎麼判讀: [
    'mu/ml 是 JS 記憶體的用量與上限(MB)。比值 >= 0.85 → JS 記憶體吃爆，方向是減少 JS 物件。',
    '⚠ mu 不含圖片解碼佔用。若 mu 比值不高但 img(頁面 img 元素數)很大 → 兇手是圖片記憶體，方向是減少同時存在的怪物動畫/特效圖。',
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
    mu: 'JS記憶體用量MB(不含圖片)', ml: 'JS記憶體上限MB', dom: 'DOM節點數', img: '頁面img元素數',
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
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // 整包交給 AI 判讀:說明＋判準＋統計＋明細一次給齊,直接貼進對話就能分析
    if (req.method === 'GET' && url.pathname === '/data') {
      if (!env.VIEW_KEY || url.searchParams.get('k') !== env.VIEW_KEY) return json({ err: 'nope' }, 403);
      const lim = Math.min(parseInt(url.searchParams.get('n') || '200', 10) || 200, 1000);
      const [tot, stats, rows] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) c, COUNT(DISTINCT did) d, MIN(ts) f, MAX(ts) l FROM crash').first(),
        env.DB.prepare(`SELECT ua_short 機型, COUNT(*) 次數, COUNT(DISTINCT did) 幾台,
                               ROUND(AVG(mu)) 平均mu, ROUND(AVG(ml)) 平均ml,
                               ROUND(AVG(CASE WHEN ml>0 THEN 1.0*mu/ml END),3) 記憶體用量比,
                               ROUND(AVG(img)) 平均img, ROUND(AVG(dom)) 平均dom,
                               ROUND(AVG(mins),1) 平均撐幾分, SUM(CASE WHEN view<>'ok' THEN 1 ELSE 0 END) 版面異常次數
                        FROM crash GROUP BY ua_short ORDER BY 次數 DESC LIMIT 50`).all(),
        env.DB.prepare(`SELECT * FROM crash ORDER BY id DESC LIMIT ?`).bind(lim).all(),
      ]);
      return json({
        ...GUIDE,
        總覽: { 總筆數: tot?.c ?? 0, 不同裝置數: tot?.d ?? 0, 最早: tot?.f, 最新: tot?.l, 本次回傳明細筆數: rows.results.length },
        依機型統計: stats.results,
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
                          mu, ml, dom, img, vfx, mob, log, tk, map, view, ff, run,
                          inv, ally, save_kb, dm, cores, w, h, dpr, errs)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      new Date().toISOString(), str(b.did, 32), str(b.ver, 24),
      str(b.app, 24), str(b.code, 32), str(b.build, 24), str(b.proto, 12),
      str(b.at, 40), ua, uaShort,
      int(b.pwa), str(b.how, 16), int(b.beats), int(b.mins),
      int(b.mu), int(b.ml), int(b.dom), int(b.img), int(b.vfx), int(b.mob), int(b.log),
      int(b.tk), str(b.map, 40), str(b.view, 120), int(b.ff), int(b.run),
      int(b.inv), int(b.ally), int(b.saveKB), int(b.dm), int(b.cores),
      int(b.w), int(b.h), Number.isFinite(b.dpr) ? b.dpr : null,
      JSON.stringify(Array.isArray(b.errs) ? b.errs.slice(0, 3) : []).slice(0, 1000)
    ).run();

    return json({ ok: 1 });
  },
};
