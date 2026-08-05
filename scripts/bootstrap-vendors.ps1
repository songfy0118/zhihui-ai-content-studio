param(
  [switch]$InstallLocalMiniDrama
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$VendorRoot = Join-Path $ProjectRoot "vendor"
$Repositories = @(
  @{ Name = "lumenx"; Url = "https://github.com/alibaba/lumenx.git" },
  @{ Name = "LocalMiniDrama"; Url = "https://github.com/xuanyustudio/LocalMiniDrama.git" },
  @{ Name = "MoneyPrinterTurbo"; Url = "https://github.com/harry0703/MoneyPrinterTurbo.git" },
  @{ Name = "CosyVoice"; Url = "https://github.com/FunAudioLLM/CosyVoice.git" },
  @{ Name = "MuseTalk"; Url = "https://github.com/TMElyralab/MuseTalk.git" }
)

New-Item -ItemType Directory -Path $VendorRoot -Force | Out-Null

foreach ($Repository in $Repositories) {
  $Destination = Join-Path $VendorRoot $Repository.Name
  if (Test-Path -LiteralPath (Join-Path $Destination ".git")) {
    Write-Host "[exists] $($Repository.Name)" -ForegroundColor DarkGray
    continue
  }
  if (Test-Path -LiteralPath $Destination) {
    $Existing = @(Get-ChildItem -Force -LiteralPath $Destination)
    if ($Existing.Count -gt 0) {
      throw "Destination exists but is not a Git repository: $Destination"
    }
  }
  Write-Host "[clone] $($Repository.Name)" -ForegroundColor Cyan
  git clone --depth 1 --recurse-submodules --shallow-submodules $Repository.Url $Destination
  if ($LASTEXITCODE -ne 0) { throw "Clone failed: $($Repository.Name)" }
}

if ($InstallLocalMiniDrama) {
  $NpmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
  $Backend = Join-Path $VendorRoot "LocalMiniDrama\backend-node"
  $Frontend = Join-Path $VendorRoot "LocalMiniDrama\frontweb"
  Write-Host "[install] LocalMiniDrama backend dependencies" -ForegroundColor Cyan
  & $NpmExe install --prefix $Backend
  if ($LASTEXITCODE -ne 0) { throw "LocalMiniDrama backend dependency install failed" }
  & $NpmExe run migrate --prefix $Backend
  if ($LASTEXITCODE -ne 0) { throw "LocalMiniDrama database migration failed" }
  Write-Host "[install] LocalMiniDrama frontend dependencies" -ForegroundColor Cyan
  & $NpmExe install --prefix $Frontend
  if ($LASTEXITCODE -ne 0) { throw "LocalMiniDrama frontend dependency install failed" }
  & $NpmExe run build --prefix $Frontend
  if ($LASTEXITCODE -ne 0) { throw "LocalMiniDrama frontend build failed" }
}

Write-Host "Vendor source is ready. Model weights and API keys must be configured separately." -ForegroundColor Green
