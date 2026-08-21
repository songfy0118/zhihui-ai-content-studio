param(
  [switch]$Execute,
  [switch]$ConfirmModelDownload
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "vendor\CosyVoice"))
$ModelRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot "pretrained_models\CosyVoice2-0.5B"))
$EnvironmentName = "zhihui-cosyvoice"
$ModelId = "iic/CosyVoice2-0.5B"
$RequiredFreeBytes = 12000000000
$RequiredModelFiles = @(
  "cosyvoice2.yaml",
  "llm.pt",
  "flow.pt",
  "hift.pt",
  "campplus.onnx",
  "speech_tokenizer_v2.onnx",
  "spk2info.pt"
)

function Test-NonEmptyFile {
  param([string]$Path)
  return (Test-Path -LiteralPath $Path -PathType Leaf) -and ((Get-Item -LiteralPath $Path).Length -gt 0)
}

function Get-EnvironmentPaths {
  try {
    $Json = (& conda env list --json 2>$null) -join "`n"
    if (-not $Json) { return @() }
    return @((ConvertFrom-Json $Json).envs)
  } catch {
    return @()
  }
}

function Test-DedicatedEnvironment {
  param([string[]]$EnvironmentPaths)
  foreach ($EnvironmentPath in $EnvironmentPaths) {
    if ((Split-Path -Leaf $EnvironmentPath) -ieq $EnvironmentName) { return $true }
  }
  return $false
}

function Get-ModelState {
  $Present = @()
  $Missing = @()
  foreach ($FileName in $RequiredModelFiles) {
    if (Test-NonEmptyFile (Join-Path $ModelRoot $FileName)) { $Present += $FileName } else { $Missing += $FileName }
  }
  return [ordered]@{
    present = $Missing.Count -eq 0
    presentFiles = $Present
    missingFiles = $Missing
  }
}

if (-not $RepositoryRoot.StartsWith($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "CosyVoice repository resolved outside the project root."
}
if (-not $ModelRoot.StartsWith($RepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "CosyVoice model directory resolved outside the vendor repository."
}

$EnvironmentPaths = Get-EnvironmentPaths
$EnvironmentPresent = Test-DedicatedEnvironment $EnvironmentPaths
$ModelState = Get-ModelState
$Drive = [System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($ProjectRoot))
$FreeBytes = $Drive.AvailableFreeSpace
$CondaAvailable = $null -ne (Get-Command conda -ErrorAction SilentlyContinue)
$RepositoryPresent = (Test-NonEmptyFile (Join-Path $RepositoryRoot "README.md")) -and (Test-NonEmptyFile (Join-Path $RepositoryRoot "requirements.txt"))

$Plan = [ordered]@{
  mode = if ($Execute) { "execution_requested" } else { "plan_only" }
  mutationPerformed = $false
  executeRequested = [bool]$Execute
  modelDownloadConfirmed = [bool]$ConfirmModelDownload
  approvalRequired = $true
  downloadTriggered = $false
  projectRoot = $ProjectRoot
  repositoryPresent = $RepositoryPresent
  condaAvailable = $CondaAvailable
  environmentName = $EnvironmentName
  environmentPresent = $EnvironmentPresent
  modelId = $ModelId
  modelRoot = $ModelRoot
  modelPresent = $ModelState.present
  modelFilesPresent = $ModelState.presentFiles
  modelFilesMissing = $ModelState.missingFiles
  freeBytes = $FreeBytes
  requiredFreeBytes = $RequiredFreeBytes
  diskReady = $FreeBytes -ge $RequiredFreeBytes
  stages = @(
    [ordered]@{ id = "environment"; action = "create_if_missing"; summary = "Create isolated Python 3.10 environment named zhihui-cosyvoice" },
    [ordered]@{ id = "dependencies"; action = "install_if_executed"; summary = "Install the repository requirements inside the isolated environment" },
    [ordered]@{ id = "model"; action = "download_if_confirmed"; summary = "Download iic/CosyVoice2-0.5B into vendor/CosyVoice/pretrained_models" },
    [ordered]@{ id = "verify"; action = "read_only_checks"; summary = "Verify seven required model files are present and non-empty" }
  )
}

if (-not $Execute) {
  $Plan | ConvertTo-Json -Depth 6
  exit 0
}

if (-not $ConfirmModelDownload) {
  throw "Execution requires both -Execute and -ConfirmModelDownload."
}
if (-not $RepositoryPresent) { throw "CosyVoice vendor repository is incomplete." }
if (-not $CondaAvailable) { throw "Conda is required to create an isolated environment." }
if ($FreeBytes -lt $RequiredFreeBytes) { throw "At least 12 GB of free disk space is required." }

if (-not $EnvironmentPresent) {
  # The current index is sufficient for the pinned Python runtime and avoids
  # downloading the substantially larger full repository metadata on first run.
  & conda create -n $EnvironmentName -y python=3.10 --repodata-fn current_repodata.json
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the CosyVoice Conda environment." }
}

& conda run -n $EnvironmentName python -m pip install setuptools==80.9.0
if ($LASTEXITCODE -ne 0) { throw "Failed to install the CosyVoice build compatibility dependency." }

& conda run -n $EnvironmentName python -m pip install --no-build-isolation -r (Join-Path $RepositoryRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Failed to install CosyVoice dependencies." }

if (-not $ModelState.present) {
  $DownloadCode = "from modelscope import snapshot_download; snapshot_download('iic/CosyVoice2-0.5B', local_dir=r'$($ModelRoot.Replace("'", "''"))')"
  & conda run -n $EnvironmentName python -c $DownloadCode
  if ($LASTEXITCODE -ne 0) { throw "Failed to download the official CosyVoice2-0.5B model." }
}

$VerifiedModelState = Get-ModelState
if (-not $VerifiedModelState.present) {
  throw "CosyVoice model verification failed. Missing: $($VerifiedModelState.missingFiles -join ', ')"
}

$Plan.mode = "executed"
$Plan.mutationPerformed = $true
$Plan.downloadTriggered = -not $ModelState.present
$Plan.environmentPresent = $true
$Plan.modelPresent = $true
$Plan.modelFilesPresent = $VerifiedModelState.presentFiles
$Plan.modelFilesMissing = @()
$Plan.approvalRequired = $false
$Plan | ConvertTo-Json -Depth 6
