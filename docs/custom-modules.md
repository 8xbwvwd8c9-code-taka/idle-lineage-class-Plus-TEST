# 自訂模組開發規範（Custom Module Development Guide）

本文件定義本專案所有自訂功能（Custom Module）的開發方式。

目的：

- 降低與 upstream 衝突
- 保持模組獨立
- 提高可維護性
- 方便未來同步 upstream

---

# 一、開發原則

優先順序：

新增檔案

>

Monkey Patch

>

Core Patch

>

修改 upstream 原始碼

禁止直接修改 upstream，除非沒有任何可擴充入口。

---

# 二、模組架構

新增功能請採用：

```

afk-xxx.js

```

例如：

```

afk-castle-buildings.js

afk-pandora.js

afk-dograce.js

```

每個模組只負責自己的功能。

---

# 三、圖片規範

禁止放置於：

```

assets/

public/

```

原因：

CI 會使用 rsync --delete

自訂圖片可能被覆蓋。

請放置：

```

custom-assets/

```

例如：

```

custom-assets/

castle/

pandora/

future/

```

圖片路徑請集中管理：

```js
const IMG_BASE = "custom-assets/pandora/";
```

禁止在程式中大量硬寫圖片路徑。

---

# 四、Plugin 規範

所有 Plugin：

統一放置：

```

scripts/afk-plugin-block.html

```

由既有流程同步到：

```

index.html

```

不要手動維護兩份 script。

---

# 五、按鈕規範

若新增入口：

優先使用：

```

#m-afk-navrow

```

比照：

```

afk-dograce.js

afk-training.js

```

禁止依賴不存在的核心按鈕。

例如：

```

btn-casino2

```

---

# 六、Monkey Patch 規範

若需修改遊戲流程：

優先：

Monkey Patch

例如：

```js
const _orig = killMob;

killMob = function () {

    ...

    return _orig.apply(this, arguments);

};
```

所有 Monkey Patch 必須：

1.

先檢查原函式存在。

例如：

```js
if (typeof killMob !== "function") {

    console.warn(...);

    return;

}
```

2.

Fail Soft

不得 throw。

不得中止遊戲。

只能：

```

console.warn()

```

3.

每個功能獨立 try/catch。

例如：

```

商城

↓

try

骰子

↓

try

競技場

↓

try

Monkey Patch

↓

try

```

不得一個 try 包全部。

---

# 七、Core Patch 規範

只有符合以下條件：

才建立：

```

apply-xxx-patches.mjs

```

例如：

```

apply-castle-patches.mjs

```

條件：

- monkey-patch 無法完成
- 必須修改 upstream 核心
- 需要錨點式 Patch

若沒有修改核心：

禁止建立空 Patch Module。

---

# 八、Patch Registry

所有 Core Patch：

集中註冊於：

```

apply-core-patches.mjs

```

例如：

```js
import { castlePatches }

from "./apply-castle-patches.mjs";

const PATCHES = [

    ...

    ...castlePatches

];
```

不得建立多個 PATCHES 陣列。

---

# 九、Fail Soft

任何模組初始化失敗：

不得影響其他模組。

只能：

```

console.warn()

```

例如：

```

商城失敗

↓

骰子仍可使用

↓

競技場仍可使用

```

---

# 十、Workspace 規範

AI 不得掃描：

```

assets/

_assets/

png

jpg

gif

webp

動畫

```

除非使用者要求。

Merge 時：

只分析：

- 發生衝突的檔案
- 直接引用的檔案

不得掃描整個 Workspace。

---

# 十一、Merge Policy

同步 upstream：

優先：

新增

不要修改 upstream。

若不得已修改 upstream：

必須：

- 保持最小修改
- 註明原因
- 保持可 Merge
- 保持可回復

---

# 十二、目前模組

目前專案模組：

| 模組 | 類型 | 架構 |
|------|------|------|
| afk-castle-buildings | Plugin + Core Patch | apply-castle-patches |
| afk-pandora | Plugin + Monkey Patch | 無 Core Patch |
| afk-dograce | Plugin | 無 Core Patch |
| afk-training | Plugin | 無 Core Patch |

新增模組請遵守本文件。

等級	類型	範例
Level 1	純 UI / Plugin	afk-dograce
Level 2	Plugin + Monkey Patch	afk-pandora
Level 3	Plugin + Core Patch	afk-castle-buildings

這樣 AI 一開始就能判斷：

Level 1 → 不碰核心。
Level 2 → 先嘗試 Monkey Patch。
Level 3 → 確認無法用 Monkey Patch 才建立 apply-xxx-patches.mjs。