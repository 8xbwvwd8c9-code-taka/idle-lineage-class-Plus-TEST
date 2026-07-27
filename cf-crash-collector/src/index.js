/* ============================================================================
 * 崩潰回報收集器 —— 收 afk-blackbox 在「下次啟動」補送的當掉快照，寫進 D1。
 *
 * 只收數字與裝置型號：記憶體、DOM/圖片/特效數量、地圖 id、tick、螢幕、UA、匿名裝置碼。
 * 不含角色名稱、身分碼、存檔內容——查白畫面用不到，帶了只是在蒐集玩家資料。
 *
 * 端點：
 *   POST /            收一筆回報（給遊戲用，公開）
 *   GET  /list?k=金鑰 最近 200 筆（JSON）
 *   GET  /stats?k=金鑰 依機型/版本聚合，看「誰在當、當的時候記憶體多少」
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (req.method === 'GET' && (url.pathname === '/list' || url.pathname === '/stats')) {
      if (!env.VIEW_KEY || url.searchParams.get('k') !== env.VIEW_KEY) return json({ err: 'nope' }, 403);
      if (url.pathname === '/list') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM crash ORDER BY id DESC LIMIT 200').all();
        return json(results);
      }
      const { results } = await env.DB.prepare(
        `SELECT ua_short AS 機型, COUNT(*) AS 次數, COUNT(DISTINCT did) AS 幾台,
                ROUND(AVG(mu),0) AS 平均JS記憶體MB, ROUND(AVG(ml),0) AS 記憶體上限MB,
                ROUND(AVG(img),0) AS 平均圖片數, ROUND(AVG(dom),0) AS 平均DOM,
                ROUND(AVG(mins),1) AS 平均撐幾分鐘
         FROM crash GROUP BY ua_short ORDER BY 次數 DESC LIMIT 50`).all();
      return json(results);
    }

    if (req.method !== 'POST') return json({ ok: 1 });

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
      `INSERT INTO crash (ts, did, ver, at, ua, ua_short, pwa, how, beats, mins,
                          mu, ml, dom, img, vfx, mob, log, tk, map, view, ff, run,
                          inv, ally, save_kb, dm, cores, w, h, dpr, errs)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      new Date().toISOString(), str(b.did, 32), str(b.ver, 24), str(b.at, 40), ua, uaShort,
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
