$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$NpmExe = (Get-Command npm.cmd -ErrorAction Stop).Source

function Test-LocalUrl([string]$Url) {
  try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-LocalUrl "http://127.0.0.1:5679/health")) {
  Start-Process -FilePath $NpmExe -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $ProjectRoot "vendor\LocalMiniDrama\backend-node") -WindowStyle Hidden
}

if (-not (Test-LocalUrl "http://127.0.0.1:3013")) {
  Start-Process -FilePath $NpmExe -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $ProjectRoot "vendor\LocalMiniDrama\frontweb") -WindowStyle Hidden
}

if (-not (Test-LocalUrl "http://127.0.0.1:3000")) {
  Start-Process -FilePath $NpmExe -ArgumentList "run", "dev" -WorkingDirectory $ProjectRoot -WindowStyle Hidden
}

$Ready = $false
for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
  if ((Test-LocalUrl "http://127.0.0.1:3000") -and (Test-LocalUrl "http://127.0.0.1:5679/health")) {
    $Ready = $true
    break
  }
  Start-Sleep -Milliseconds 750
}

if (-not $Ready) {
  throw "本机操作台启动超时。请在 Codex 中查看启动日志。"
}

Start-Process "http://127.0.0.1:3000"
Write-Host "知绘工厂已启动：选择选题后，点击“交给本机引擎”即可创建真实漫剧项目。" -ForegroundColor Green
