/* ============================================================================
 * smoke-hooks.mjs — 冒煙測試:用無頭瀏覽器載入 index.html,確認五支外掛都 hook 成功
 *
 * 用途:自動同步原作者 index.html 後,驗證原作者沒有改壞外掛掛點(改 id / DOM 結構)。
 *   - 全部 hooks OK → exit 0(workflow 才會 commit/push)
 *   - 任一外掛沒掛上 → exit 1(workflow 改為開 issue 通知,不自動推壞掉的版本)
 * ========================================================================== */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium, devices } from 'playwright';

const PORT = 8799;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = join(process.cwd(), normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const logs = [];

// 各外掛的開機 log:'[AFK] hooks OK' / '[AFK-mobile] hooks OK' / …(集中定義,goto 後輪詢等待 + 最後判定共用)
// afk-mobile 為「桌機零接觸」設計——只有偵測到手機尺寸/裝置才會 init 並印出 hooks OK(見 afk-mobile.js);
//   故它單獨在「手機模擬」那一輪驗,桌機那輪不列入(否則桌機永遠等不到它、smoke 假性失敗)。
// afk-battlehud 桌機也會 init(只是 CSS 讓它不顯示)→ 放 need 即可;它取代的是核心手機版 #mobile-vitals。
// afk-touchtip 只在觸控裝置 init(桌機有 hover,本來就不該掛)→ 桌機那輪永遠等不到,必須放手機輪。
const needMobileOnly = ['[AFK-touchtip]'];
const need = ['[AFK]', '[AFK-banner]', '[AFK-lzcache]', '[AFK-synccompress]', '[AFK-clanroster]', '[AFK-allyslim]', '[AFK-dollcursor]', '[AFK-mobile]', '[AFK-backnav]', '[AFK-battlehud]', '[AFK-mapbar]', '[AFK-nozoom]', '[AFK-statusicon]', '[AFK-trackinfo]', '[AFK-relicguard]', '[AFK-wpnfix]', '[AFK-enhtarget]', '[AFK-retrial]', '[AFK-attrbatch]', '[AFK-cursebatch]', '[AFK-battlebuffs]', '[AFK-slotinfo]', '[AFK-dex]', '[AFK-wiki]', '[AFK-syncinfo]', '[AFK-statpts]', '[AFK-statlist]', '[AFK-pwa]', '[AFK-storage]', '[AFK-fullsave]', '[AFK-quotawarn]', '[AFK-notice]', '[AFK-history]', '[AFK-reissueid]', '[AFK-diag]', '[AFK-mobname]', '[AFK-npclabel]', '[AFK-training]', '[AFK-junkmgr]', '[AFK-mercguard]', '[AFK-itemsearch]', '[AFK-eqlist]', '[AFK-npclist]', '[AFK-whbatch]', '[AFK-anyclass]', '[AFK-locksafe]', '[AFK-skin]'];
const seen = (list) => list.every((n) => logs.some((l) => l.includes(n) && l.includes('hooks OK')));

// ⚠ 不用 waitUntil:'networkidle':作者新版(.49 起)加了背景音樂 assets/bgm/*.mp3，<audio> 媒體串流會讓網路
//   「永遠不靜止」→ networkidle 等不到逾時、smoke 假性失敗、自動同步整個卡住(踩過 2026-06-30,掛點其實全正常)。
//   改成 domcontentloaded + 輪詢「外掛是否都印出 hooks OK」,既驗到掛點、又完全不受媒體/長連線影響。

// --- 第一輪:桌機視窗,驗桌機面向的 12 支外掛 + 地圖翻譯 ---
const page = await browser.newPage();
page.on('console', (m) => logs.push(m.text()));
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
const _deadline = Date.now() + 20000;   // 最多等 20 秒讓全部外掛初始化(CI 較慢)
while (Date.now() < _deadline && !seen(need)) await page.waitForTimeout(200);
await page.waitForTimeout(300);   // 緩衝:讓 hooks 之後的索引(dex/wiki)與 AFK_EXTRA 建好,再做地圖翻譯檢查

// --- 第二輪:手機模擬(iPhone 13),專驗 afk-mobile 的三欄掛點在作者最新 DOM 上仍成立 ---
//   afk-mobile 只在手機時 init,桌機那輪印不出 hooks OK;用真手機模擬(pointer:coarse/UA)讓它跑起來才驗得到。
const mctx = await browser.newContext({ ...devices['iPhone 13'] });
const mpage = await mctx.newPage();
mpage.on('console', (m) => logs.push(m.text()));
await mpage.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
const _mDeadline = Date.now() + 20000;
while (Date.now() < _mDeadline && !seen(needMobileOnly)) await mpage.waitForTimeout(200);

// --- 第三輪:手機 + 「手機版面」外掛關閉 ---
//   為什麼要驗這個:玩家可以逐支關外掛,但 afk-toggles 的逃生門按鈕與各外掛入口「不可以跟著消失」——
//   否則玩家關掉某支外掛後連把它開回來的入口都沒有,變成死結(2026-07-20 實際回報)。
//   歷史成因都是「基礎設施依賴了可被關掉的外掛」:逃生門的 top 讀 afk-mobile 設的 --orig-bar-h、
//   afk-skin 靠 afk-mobile 掛的 body.m-mobile 判斷手機。前兩輪都是「全開」狀態,永遠測不到。
const octx = await browser.newContext({ ...devices['iPhone 13'] });
const opage = await octx.newPage();
await opage.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await opage.evaluate(() => localStorage.setItem('afk_toggle_mobile', '0'));
await opage.reload({ waitUntil: 'domcontentloaded' });
await opage.waitForTimeout(3000);
// 模擬線上的非官方橫幅(本機沒有;逃生門必須避開它)
await opage.evaluate(() => {
  if (document.getElementById('_orig_pbar')) return;
  const d = document.createElement('div');
  d.id = '_orig_pbar';
  d.style.cssText = 'position:fixed;left:0;right:0;top:0;height:92px;background:#123;z-index:2147483647;';   // z-index 要用線上實測值(遊戲橫幅是 int 上限);設低了會蓋不住按鈕、測不出遮蔽
  // ⚠ 文字不可省:外掛認橫幅是靠文字比對(/shines871|官方|非官方|轉載/,見 afk-mobile/afk-battlehud 的 findBanner)。
  //   沒文字的假橫幅在偵測邏輯眼中根本不存在 → 只測得到「z-index 硬蓋」,完全驗不到「量測→讓位」那條路徑。
  d.textContent = '這是非官方轉載版本，前往官方最新版：shines871.github.io/idle-lineage-class';
  document.body.appendChild(d);
});
await opage.waitForTimeout(1500);
const toggleOffProblems = await opage.evaluate(() => {
  const bad = [];
  // 橫幅讓位:必須由 afk-banner(不可停用)提供 → 關掉「手機版面」後依然要生效。
  //   歷史成因:讓位整組寫在 afk-mobile 裡,平板玩家為了換回三欄把它關掉 → 頂端(冒險地圖標題/黑市/瞬移/右欄分頁)
  //   全被橫幅蓋住(2026-07-23 回報)。
  const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--orig-bar-h')) || 0;
  const barBottom = document.getElementById('_orig_pbar').getBoundingClientRect().bottom;
  if (barH < barBottom) bad.push(`--orig-bar-h(${barH}px) 沒讓開橫幅(底端 ${barBottom}px)`);
  for (const id of ['app-stage', 'creation-screen']) {
    const el = document.getElementById(id);
    if (el && el.getBoundingClientRect().top < barBottom) bad.push(`#${id} 頂端(${Math.round(el.getBoundingClientRect().top)}px)還在橫幅底下,會被蓋住`);
  }
  const btn = document.getElementById('afk-toggles-entry');
  if (!btn) bad.push('左上角「外掛開關」逃生門按鈕不存在');
  else {
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!(r.width > 0 && r.height > 0)) bad.push('逃生門按鈕沒有尺寸');
    else if (!(top === btn || btn.contains(top))) bad.push(`逃生門按鈕被「${(top && (top.id || top.tagName)) || '未知元素'}」蓋住,點不到`);
  }
  // 入口(掉落查詢/小百科)在手機上必須直接可見,不可被收進桌機用的 Modal
  for (const [sel, nm] of [['.m-dex-entry-main', '掉落查詢入口'], ['.m-wiki-entry-main', '小百科入口']]) {
    const el = document.querySelector(sel);
    if (!el) { bad.push(nm + '不存在'); continue; }
    if (el.getBoundingClientRect().height <= 0) bad.push(nm + '高度為 0(被收進桌機 Modal?)');
  }
  return bad;
});

// --- 第四輪:平板幾何(觸控 + 寬 > 768),驗右欄分頁不會「內外兩層都不捲」---
//   afk-mobile 的 detectMobile() 只要 pointer:coarse 就算手機,範圍比上游 CSS 的手機斷點
//   (max-width:768px / max-height:520px and pointer:coarse)大 → 觸控平板在我方眼中是手機、在上游眼中是桌機。
//   我方「把分頁攤平、交給 #game-screen 單層捲」那組規則若沒包進上游同一條 media query,平板就會拿到
//   「分頁不捲(我方規則) + #game-screen 也不捲(上游桌機幾何)」→ 道具/防具/設定超出畫面的部分永遠
//   看不到也滑不到(2026-07-25 玩家回報)。前三輪都是手機或桌機尺寸,正好落在這道縫的兩側,測不到。
const tctx = await browser.newContext({
  viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const tpage = await tctx.newPage();
await tpage.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await tpage.waitForTimeout(3000);
const tabletProblems = await tpage.evaluate(() => {
  const bad = [];
  const SCROLLABLE = ['auto', 'scroll'];
  const oy = (el) => getComputedStyle(el).overflowY;
  // 前置:只有「我方當手機、上游當桌機」這道縫才有混搭問題;兩邊同調時本檢查不適用。
  if (!document.body.classList.contains('m-mobile')) return bad;
  if (matchMedia('(max-width: 768px), (max-height: 520px) and (pointer: coarse)').matches) return bad;
  const gs = document.getElementById('game-screen');
  if (gs && SCROLLABLE.includes(oy(gs))) return bad;   // 外層自己就是捲動容器 → 分頁攤平是安全的
  const panel = document.getElementById('tab-content-panel');
  if (panel && oy(panel) === 'visible') bad.push('#tab-content-panel 被攤平(overflow-y:visible),但 #game-screen 不是捲動容器');
  for (const id of ['tab-items', 'tab-weapons', 'tab-armors', 'tab-automation']) {
    const el = document.getElementById(id);
    if (!el) { bad.push(`#${id} 不存在(上游改了分頁 id?)`); continue; }
    if (!SCROLLABLE.includes(oy(el))) bad.push(`#${id} 不是捲動容器(overflow-y:${oy(el)}),而 #game-screen 也不捲`);
  }
  return bad;
});

// 🩸 同一道縫的第二個症狀:手機殼在(單欄+底部導覽)但「我方戰鬥狀態列」用上游那條窄 media query 判手機
//   → 平板拿不到頂端血量列,而上游 #mobile-vitals 在它眼中是桌機也不顯示 → 兩條都沒有(2026-07-26 玩家回報)。
//   判準:凡「手機殼套用了就該有」的手機專屬元素,平板尺寸下必須有「一條生效路徑」。
//   ⚠ 不可用「放寬 @media」來補:那條 CSS 是上游手機單欄版面的一員,平板會變成桌機三欄裡的第四欄
//     把戰鬥區/喝水鈕擠掉(2026-07-26 踩過)。正解=外掛自己算出平板缺口、掛自己的 body class 走第二套版面。
//   ⚠ smoke 停在主選單(沒載入角色),戰鬥畫面沒開 → 不能驗「元素看不看得到」,改驗生效路徑:
//     ①某條 @media 條件成立(手機),或 ②有一條 `body.afk-*` 規則,而那個 class 現在真的掛在 body 上(平板)。
const tabletHudProblems = await tpage.evaluate(() => {
  const bad = [];
  if (!document.body.classList.contains('m-mobile')) return bad;   // 沒套手機殼就不適用
  const check = [['afk-battlehud-style', '手機戰鬥狀態列'], ['afk-battlebuffs-style', '手機戰鬥狀態欄']];
  for (const [styleId, label] of check) {
    const st = document.getElementById(styleId);
    if (!st) continue;   // 該外掛被關掉 → 不適用
    let hit = false, seen = [];
    try {
      for (const rule of st.sheet.cssRules) {
        if (rule.type === CSSRule.MEDIA_RULE) {
          seen.push('@media ' + rule.conditionText);
          if (matchMedia(rule.conditionText).matches) { hit = true; break; }
        } else if (rule.type === CSSRule.STYLE_RULE) {
          const m = /body\.(afk-[\w-]+)/.exec(rule.selectorText || '');
          if (!m) continue;
          seen.push('body.' + m[1]);
          if (document.body.classList.contains(m[1])) { hit = true; break; }
        }
      }
    } catch (e) { continue; }
    if (seen.length && !hit) bad.push(label + '在平板沒有任何生效路徑(試過 ' + seen.join(' / ') + ') → 手機殼套上了卻拿不到這個元素');
  }
  return bad;
});

// 🗺️ 地圖名翻譯覆蓋檢查:掉落查詢的「出沒地圖」來源＝DB.maps 的 key,經 AFK_EXTRA.mapName 解析。
//   mapName 查不到任一中文來源時會原樣回傳英文 id(name === id),這就是「漏翻」的精準訊號。
//   作者新增「不在 MAP_CATEGORIES/MAP_REGIONS/DB.towns…」的地圖結構時會被這裡擋下 → 提醒補進 mapName。
const untranslatedMaps = await page.evaluate(() => {
  const out = [];
  try {
    const mn = (window.AFK_EXTRA && AFK_EXTRA.mapName) ? AFK_EXTRA.mapName : null;
    if (mn && typeof DB !== 'undefined' && DB.maps) {
      for (const id of Object.keys(DB.maps)) {
        const nm = String(mn(id));
        if (nm === id || /[A-Za-z]/.test(nm)) out.push([id, nm]);   // 原樣回傳 id 或仍含英文字母 = 漏翻
      }
    }
  } catch (e) {}
  return out;
});

// 🔌 桌機外掛入口區塊(afk-skin 的 #afk-plugin-panel):整塊絕對定位在左欄「版本號正上方」。
//   座標是照上游 4:3 舞台的百分比放的 → 上游改首頁版面(標題變高、搬 #login-meta-layer、換舞台元素)時,
//   入口不會消失、只會疊到標題/版號上或被舞台的 overflow:hidden 切掉,肉眼不掃根本看不出來。
const pluginPanelProblems = await page.evaluate(() => {
  const bad = [];
  const rectOf = (s) => { const el = document.querySelector(s); return el && el.getBoundingClientRect(); };
  const panel = document.getElementById('afk-plugin-panel');
  if (!panel) { bad.push('#afk-plugin-panel 不存在(桌機入口沒被放到左欄)'); return bad; }
  const kids = [...panel.children].map((c) => c.getBoundingClientRect());
  if (!kids.length) { bad.push('#afk-plugin-panel 是空的(入口沒被搬進來)'); return bad; }
  const top = Math.min(...kids.map((r) => r.top)), bottom = Math.max(...kids.map((r) => r.bottom));
  const ver = rectOf('#login-version'), title = rectOf('#login-title-layer'), stage = rectOf('#login-art-stage');
  if (ver && bottom > ver.top) bad.push(`入口區塊底端(${Math.round(bottom)}px)壓到版本號(頂端 ${Math.round(ver.top)}px)`);
  if (title && top < title.bottom) bad.push(`入口區塊頂端(${Math.round(top)}px)壓到標題(底端 ${Math.round(title.bottom)}px)`);
  if (stage && (top < stage.top || bottom > stage.bottom)) bad.push('入口區塊超出 4:3 舞台,會被 overflow:hidden 切掉');
  for (const [sel, nm] of [['.m-dex-entry-main', '掉落查詢入口'], ['.m-wiki-entry-main', '小百科入口'], ['#afk-stg-gear', '⚙ 其他功能']]) {
    const r = rectOf(sel);
    if (!r) { bad.push(nm + '不存在'); continue; }
    if (!(r.width > 0 && r.height > 0)) { bad.push(nm + '沒有尺寸'); continue; }
    const el = document.querySelector(sel);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!(hit === el || el.contains(hit))) bad.push(`${nm}被「${(hit && (hit.id || hit.tagName)) || '未知元素'}」蓋住,點不到`);
  }
  return bad;
});

// 🗡️ 裝備頁覆蓋檢查:三件事,都是「畫面正常、只是查不到」的靜默失效。
//   ① 無條件件數 == DB.items 的裝備數 → 沒有裝備在索引階段被漏掉。
//   ② 部位按鈕的件數加總 == 總件數 → 上游新增 slot 時,那個部位在篩選面板裡**沒有按鈕**(索引有、篩不到),
//      而清單只畫前 40 列,不捲到底根本看不到它 —— 加總對不上是唯一會早期爆出來的訊號。
//   ③ 部位按鈕的名稱不可含英文字母 → 沒補進 EQUIP_GROUPS 的 slot 會直接把原始 key 印在畫面上。
//   (歷史:魔法娃娃 50 件 + 地龍之魔眼 1 件曾因部位對不上分組桶而整組消失。)
const equipPageProblems = await page.evaluate(async () => {
  const bad = [];
  try {
    if (!window.AFK_WIKI_API || typeof DB === 'undefined' || !DB.items) return bad;
    AFK_WIKI_API.goto({ tab: 'equip' });
    await new Promise((r) => setTimeout(r, 800));
    const cntEl = document.getElementById('m-eq-cnt');
    if (!cntEl) { bad.push('裝備頁的控制列不見了(找不到 #m-eq-cnt)→ 篩選器沒渲染出來'); return bad; }
    const shown = parseInt(String(cntEl.textContent).replace(/[^0-9]/g, ''), 10);
    let total = 0;
    for (const id in DB.items) {
      const d = DB.items[id];
      if (d && d.n && (d.type === 'wpn' || d.type === 'arm' || d.type === 'acc')) total++;
    }
    if (shown !== total) bad.push(`裝備頁無條件時只列 ${shown} 件,DB.items 裡有 ${total} 件裝備 → 有裝備在索引階段被漏掉`);
    const btn = document.querySelector('[data-lfsheet]');
    if (!btn) { bad.push('裝備頁找不到「篩選」按鈕'); return bad; }
    btn.click();
    await new Promise((r) => setTimeout(r, 200));
    const chips = [...document.querySelectorAll('#m-eq-sheet [data-lfchip="slot"]')];
    if (!chips.length) { bad.push('篩選面板裡沒有任何「部位」按鈕'); return bad; }
    let sum = 0;
    for (const c of chips) {
      const i = c.querySelector('i');
      sum += i ? (parseInt(i.textContent.replace(/[^0-9]/g, ''), 10) || 0) : 0;
      const label = c.textContent.replace(/[0-9]/g, '');
      if (/[A-Za-z]/.test(label)) bad.push(`部位按鈕「${label.trim()}」露出英文/原始 key → 該 slot 沒補進 EQUIP_GROUPS`);
    }
    if (sum !== total) bad.push(`部位按鈕件數加總 ${sum} ≠ 總件數 ${total} → 有部位在篩選面板裡沒有按鈕(篩不到那批裝備)`);
    const body = document.getElementById('m-wiki-body');
    if (body && body.scrollWidth > body.clientWidth) bad.push(`裝備頁有橫向捲動(scrollWidth ${body.scrollWidth} > clientWidth ${body.clientWidth})`);
  } catch (e) { bad.push('裝備頁檢查本身出錯:' + e.message); }
  return bad;
});

await browser.close();
server.close();

const okMap = {};
for (const n of [...need, ...needMobileOnly]) okMap[n] = logs.some((l) => l.includes(n) && l.includes('hooks OK'));
const allOK = Object.values(okMap).every(Boolean);

console.log('外掛掛點檢查:', JSON.stringify(okMap, null, 0));
if (!allOK) {
  console.error('冒煙測試失敗:有外掛沒有成功 hook(原作者可能改了 DOM / id)。');
  process.exit(1);
}

if (toggleOffProblems.length) {
  console.error('冒煙測試失敗:關掉「手機版面」外掛後,手機上的逃生門/入口不見了(玩家會無法把外掛開回來):');
  for (const p of toggleOffProblems) console.error('  ' + p);
  console.error('  判準:不可停用的基礎設施不能依賴可被關掉的外掛提供的 CSS 變數 / body class。');
  process.exit(1);
}

if (pluginPanelProblems.length) {
  console.error('冒煙測試失敗:桌機首頁左欄的外掛入口區塊位置不對(玩家會看到入口疊在標題/版號上或被切掉):');
  for (const p of pluginPanelProblems) console.error('  ' + p);
  console.error('  判準:#afk-plugin-panel 的座標(left/width/top/bottom)是照上游 4:3 舞台算的,');
  console.error('       上游搬動 #login-title-layer / #login-meta-layer 就要跟著調(見 afk-skin.js 的 CSS)。');
  process.exit(1);
}

if (equipPageProblems.length) {
  console.error('冒煙測試失敗:小百科「裝備」分頁的覆蓋/版面有問題:');
  for (const p of equipPageProblems) console.error('  ' + p);
  console.error('  判準:部位對不上分組桶的裝備要落進「❓ 其他部位」,不可整組消失(見 afk-wiki.js 的 equipGroupKey / EQUIP_GROUPS)。');
  process.exit(1);
}

if (tabletHudProblems.length) {
  console.error('冒煙測試失敗:平板(觸控·寬 820)拿不到手機專屬的戰鬥狀態列/狀態欄:');
  for (const p of tabletHudProblems) console.error('  ' + p);
  console.error('  判準:不要放寬上游那條 @media(會變成桌機三欄裡的第四欄,擠掉戰鬥區與喝水鈕),');
  console.error('       改由外掛自己判平板缺口、掛自己的 body class 走第二套版面(見 afk-battlehud.js 的 placeStrip)。');
  process.exit(1);
}

if (tabletProblems.length) {
  console.error('冒煙測試失敗:平板(觸控·寬 820)上右欄分頁內外兩層都不捲,超出畫面的內容看不到也滑不到:');
  for (const p of tabletProblems) console.error('  ' + p);
  console.error('  判準:要覆寫上游「寫在 media query 裡」的樣式時,自己的規則必須包進同一條 media query');
  console.error('       (afk-mobile.js 的 MOBILE_GEOM_MQ);只寫 body.m-mobile 會讓觸控平板拿到混搭幾何。');
  process.exit(1);
}

if (untranslatedMaps.length) {
  console.error('冒煙測試失敗:掉落查詢有地圖名未翻譯(會顯示英文 id),請補進 afk-extradata.js 的 AFK_EXTRA.mapName:');
  for (const [id, nm] of untranslatedMaps) console.error(`  ${id}  ->  ${nm}`);
  process.exit(1);
}

console.log('冒煙測試通過:外掛 hooks OK,且掉落查詢地圖名全部已翻譯。');
