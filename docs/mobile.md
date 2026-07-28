# 手機 / 平板版面規則

> 改任何「手機專屬」外掛(afk-mobile / battlehud / battlebuffs / mapbar / touchtip / toast / backnav…)或覆寫上游手機樣式前先讀本檔。核心的「不可停用基礎設施」兩條判準在 `CLAUDE.md`。

## 手機專屬元素在平板要「另一套版面」,不是把上游那條 media query 放寬

afk-mobile 的 `detectMobile()`(coarse 或寬 ≤820)比上游 CSS 的手機斷點(`max-width:768px` / `max-height:520px and pointer:coarse`)寬 → 平板直向落在縫裡:我方已切成單欄手機殼,上游眼中卻還是桌機(`#mobile-vitals` 不顯示、照抄上游條件的 `afk-battlehud`/`afk-battlebuffs` 也不生效)。

**放寬 MQ 是錯解**:上游那些樣式是「手機單欄版面的一員」(如狀態列的 `position:sticky;order:-11;width:100%`),平板的 `#game-screen` 其實還是桌機三欄 flex → 元素變成第四欄,把戰鬥區與喝水鈕擠出畫面。正解=**同一支外掛做兩套版面、自己判在哪一套**(`afk-battlehud` 的 `inTabletGap()`/`placeStrip()`):

- 手機(上游那條窄 MQ 成立)→ 位置照舊:`#game-screen` 單欄流的第一個子項、sticky 釘頂。
- 平板缺口(`body.m-mobile` 在、窄 MQ 不成立)→ 掛自己的 `body.afk-hud-tab`,把元素**放進「目前顯示的那一欄」**(`#col-left/center/right`)當普通區塊;切分頁時跟著搬。
- ⚠ **`#game-screen` 是 `position:absolute`(釘在 `#app-stage` 裡)→ 放它「外面」當兄弟節點會被整張畫面蓋住**。
- ⚠ 元素的**內部外觀**(內距/顏色/血條)不要包在 media query 裡,不然平板模式只拿到骨架沒有樣式。整條沒啟用時本來就 `display:none`,無條件宣告不影響桌機。
- 這裡讀 `body.m-mobile` 是對的(不違反「不依賴可關外掛」):手機殼被關掉＝畫面回三欄,桌機完整狀態面板本來就看得到,這條不該出現。

判準:**問「手機殼套上了就該有它嗎?」是 → 該外掛必須在平板尺寸有一條生效路徑(自己的 body class),不是放寬上游那條 MQ;只是窄畫面排版優化(如 afk-mapbar 把標題列壓兩排)才單純留上游那條窄的。** smoke 第四輪已加檢查:平板 context 下,手機專屬外掛注入的樣式必須有「某條 `@media` 成立」或「某條 `body.afk-*` 規則的 class 真的掛在 body 上」。

## 覆寫上游「寫在 media query 裡」的樣式時,自己的規則要包進同一條 media query

afk-mobile 的 `detectMobile()` 跟上游 CSS 的手機斷點**判定範圍不一樣**——觸控平板在我們眼中是手機、在上游 CSS 眼中是桌機。只寫 `body.m-mobile` 就去覆寫上游手機版的 `top`/`height`,平板會拿到「我們的定位＋上游的桌機 transform」→ 兩套幾何混搭,元素被 `translate(-50%,-50%)` 推出畫面(城鎮 NPC 視窗踩過,top 到 −489、上半截全在畫面外,**手機與桌機都測不出來**)。

判準:**要覆寫的上游宣告是包在 media query 裡的嗎?** 是 → 自己的規則也包同一條;只有純位移／封頂(padding、max-height)這種「哪種幾何都成立」的才可以裸寫。**此規則已有 smoke 把關**:`smoke-hooks.mjs` 第四輪用 820×1180 觸控 context 驗「`#game-screen` 不捲時右欄分頁必須各自捲得動」,裸寫 `body.m-mobile` 覆寫上游手機規則會當場紅(捲動這組的條件常數=afk-mobile 的 `MOBILE_GEOM_MQ`)。

## 新增「釘在畫面上」(fixed/sticky)的手機元素 → 自己量橫幅,並用「帶文字」的假橫幅驗遮蔽

橫幅 z-index 是 int 上限、壓得過任何外掛,而各外掛認橫幅是**比對文字**(`/shines871|官方|非官方|轉載/`,見 findBanner)——**沒文字的假橫幅在偵測邏輯眼中不存在**,只測得到「z-index 硬蓋」,驗不到「量測→讓位」那條路徑(smoke 第三輪的假橫幅原本就漏了文字,已補)。

判準:元素釘死在頂端 → ①讓位讀 `--orig-bar-h` / `AFK_BANNER`(afk-banner 提供、不可停用),真的要自己量就照 findBanner 那組特徵 ②測試裡的假橫幅要有文字。
