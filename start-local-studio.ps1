$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeExe = "C:\Users\93785\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path -LiteralPath $NodeExe)) {
  throw "Node.js runtime was not found. Open this project in Codex once to restore the bundled runtime."
}

Start-Process -FilePath $NodeExe -ArgumentList (Join-Path $ProjectRoot "bridge\server.mjs") -WorkingDirectory $ProjectRoot -WindowStyle Hidden
Start-Sleep -Seconds 2
Start-Process "https://zhihui-ai-studio.songfy0118.chatgpt.site"
Write-Host "知绘工厂已启动。不要关闭此窗口，生成完成后按 Ctrl+C。" -ForegroundColor Green
while ($true) { Start-Sleep -Seconds 30 }
