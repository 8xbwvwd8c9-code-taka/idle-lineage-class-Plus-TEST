## Plugin Integration Checklist
PowerShell / Node 腳本執行規則
禁止事項
禁止使用 node -e 執行多行或複雜 JavaScript。
禁止產生超過一行的 node -e 指令。
禁止使用 PowerShell 的 Add-Content、Set-Content 等指令逐行拼接 JavaScript。
禁止為了避開引號問題而使用 Base64 編碼 JavaScript。
禁止要求使用者複製長串 PowerShell 指令來建立 JavaScript 檔案。
必須遵守
任何超過幾行的 JavaScript，一律建立獨立 .js 檔案。
所有程式碼直接寫入 .js 檔，不要透過 PowerShell 字串組合。
執行方式固定為：
node fix-ui.js

或

node scripts/fix-ui.js
如果需要修改現有檔案，請直接在 .js 中使用 fs.readFileSync()、fs.writeFileSync() 完成，不要透過 PowerShell 操作程式內容。
原因

PowerShell 會先解析命令列內容，容易造成：

< 被當成 PowerShell 運算子
> 被重新導向
{}、() 被 PowerShell 提前解析
"、' 跳脫失敗
Unexpected token
ParserError
The '<' operator is reserved for future use.

這些錯誤與 JavaScript 本身無關，而是 PowerShell 的語法解析造成。

標準流程
建立或修改 fix-ui.js
將完整 JavaScript 寫入該檔案
執行：
node fix-ui.js
如需修改其他檔案，全部在 JavaScript 內完成，不要使用 PowerShell 拼接程式碼。

此規則為強制規範，不得以 node -e、PowerShell 字串拼接、Base64 或其他方式繞過。若需要產生腳本，一律提供完整 .js 檔案內容。

## Git 操作流程

同步上游：

1. 切回 main
2. pull origin/main
3. fetch upstream
4. 建立 update-vX.X.XX 分支
5. merge upstream/main
6. 解決衝突
7. push update 分支
8. 測試完成後 merge 回 main
9. push origin main

禁止直接在 main 解決 upstream merge。

## 新增 Plugin 流程

新增 afk-*.js 後：

1.
修改：

scripts/afk-plugin-block.html

2.
同步更新：

index.html

（或執行專案同步流程）

3.

執行：

node scripts/stamp-code-versions.mjs

4.

確認：

findstr /N "afk-xxx.js" index.html

5.

瀏覽器：

document.querySelector('script[src*="afk-xxx"]')

不得為 null。

## 發版前

確認：

git status

應為：

working tree clean

確認：

node scripts/stamp-code-versions.mjs --check

確認：

git diff --check

無任何輸出。

最後：

git push origin main

## Merge 後檢查

確認：

git diff --check

確認：

無：

<<<<<<<

=======

>>>>>>>

確認：

node scripts/apply-core-patches.mjs --check

全部通過。

若新增 Plugin：

確認 index.html 已引用。

## 常用檢查

查看 Plugin：

findstr /N "afk-pandora.js" index.html

查看 script：

document.querySelector('script[src*="afk-pandora"]')

查看狀態：

git status

查看差異：

git diff

查看衝突：

git diff --check


