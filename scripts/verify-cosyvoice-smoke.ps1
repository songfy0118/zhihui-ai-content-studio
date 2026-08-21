param(
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$RepositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $ProjectRoot "vendor\CosyVoice"))
$ModelRoot = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot "pretrained_models\CosyVoice2-0.5B"))
$PromptWav = [System.IO.Path]::GetFullPath((Join-Path $RepositoryRoot "asset\zero_shot_prompt.wav"))
$SmokeScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "cosyvoice-smoke.py"))
$EnvironmentName = "zhihui-cosyvoice"
$RequiredModelFiles = @("cosyvoice2.yaml", "llm.pt", "flow.pt", "hift.pt", "campplus.onnx", "speech_tokenizer_v2.onnx", "spk2info.pt")

function Test-NonEmptyFile {
  param([string]$Path)
  return (Test-Path -LiteralPath $Path -PathType Leaf) -and ((Get-Item -LiteralPath $Path).Length -gt 0)
}

function Test-DedicatedEnvironment {
  try {
    $Json = (& conda env list --json 2>$null) -join "`n"
    if (-not $Json) { return $false }
    foreach ($EnvironmentPath in @((ConvertFrom-Json $Json).envs)) {
      if ((Split-Path -Leaf $EnvironmentPath) -ieq $EnvironmentName) { return $true }
    }
  } catch {}
  return $false
}

if (-not $ModelRoot.StartsWith($RepositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "CosyVoice model directory resolved outside the vendor repository."
}
if (-not $SmokeScript.StartsWith($ProjectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Smoke test script resolved outside the project root."
}

$MissingModelFiles = @($RequiredModelFiles | Where-Object { -not (Test-NonEmptyFile (Join-Path $ModelRoot $_)) })
$EnvironmentPresent = Test-DedicatedEnvironment
$PromptPresent = Test-NonEmptyFile $PromptWav
$ScriptPresent = Test-NonEmptyFile $SmokeScript
$ReadyToExecute = $EnvironmentPresent -and ($MissingModelFiles.Count -eq 0) -and $PromptPresent -and $ScriptPresent

$Plan = [ordered]@{
  mode = if ($Execute) { "execution_requested" } else { "plan_only" }
  mutationPerformed = $false
  executeRequested = [bool]$Execute
  smokeTriggered = $false
  resultType = "smoke_test"
  businessEvidence = $false
  publishable = $false
  environmentName = $EnvironmentName
  environmentPresent = $EnvironmentPresent
  modelPresent = $MissingModelFiles.Count -eq 0
  missingModelFiles = $MissingModelFiles
  promptPresent = $PromptPresent
  runnerPresent = $ScriptPresent
  readyToExecute = $ReadyToExecute
  blockers = @(
    if (-not $EnvironmentPresent) { "cosyvoice_environment_missing" }
    if ($MissingModelFiles.Count -gt 0) { "cosyvoice_model_missing" }
    if (-not $PromptPresent) { "bundled_prompt_missing" }
    if (-not $ScriptPresent) { "smoke_runner_missing" }
  )
}

if (-not $Execute) {
  $Plan | ConvertTo-Json -Depth 5
  exit 0
}
if (-not $ReadyToExecute) {
  throw "CosyVoice smoke test is blocked: $($Plan.blockers -join ', ')"
}

& conda run -n $EnvironmentName python $SmokeScript
if ($LASTEXITCODE -ne 0) { throw "CosyVoice one-sentence smoke test failed." }
