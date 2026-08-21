param([switch]$NoBrowser)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$NpmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$ExpectedBridgeProtocol = 3
$ExpectedDraftProtocol = 1
$RequiredBridgeCapabilities = @(
  "engine_readiness",
  "cosyvoice_preflight",
  "musetalk_preflight",
  "moneyprinter_preflight",
  "isolated_d1_chain_verification"
)

function Test-LocalUrl([string]$Url) {
  try {
    $null = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

function Get-BridgeProtocolStatus {
  try {
    $Health = Invoke-RestMethod -Uri "http://127.0.0.1:3765/health" -TimeoutSec 2
    $ReportedVersion = if ($Health.PSObject.Properties.Name -contains "protocolVersion") { $Health.protocolVersion } else { $null }
    $ReportedCapabilities = if ($Health.PSObject.Properties.Name -contains "capabilities") { @($Health.capabilities) } else { @() }
    $MissingCapabilities = @($RequiredBridgeCapabilities | Where-Object { $_ -notin $ReportedCapabilities })

    return [pscustomobject]@{
      Current = ($ReportedVersion -eq $ExpectedBridgeProtocol -and $MissingCapabilities.Count -eq 0)
      ReportedVersion = $ReportedVersion
      MissingCapabilities = $MissingCapabilities
    }
  } catch {
    return [pscustomobject]@{
      Current = $false
      ReportedVersion = $null
      MissingCapabilities = @($RequiredBridgeCapabilities)
    }
  }
}

function Get-StudioBuildStatus {
  try {
    $Base = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/local/social-draft-handoff" -TimeoutSec 2
    $ProjectResponse = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/local/social-draft-handoff?project=octopus-pilot" -TimeoutSec 2
    $Project = $ProjectResponse.Content | ConvertFrom-Json
    $ReportedVersion = if ($Base.PSObject.Properties.Name -contains "draftHandoffProtocolVersion") { $Base.draftHandoffProtocolVersion } else { $null }
    $PackagePlanPresent = $null -ne $Project.packagePlan

    return [pscustomobject]@{
      Current = ($ReportedVersion -eq $ExpectedDraftProtocol -and $PackagePlanPresent)
      ReportedVersion = $ReportedVersion
      PackagePlanPresent = $PackagePlanPresent
    }
  } catch {
    return [pscustomobject]@{
      Current = $false
      ReportedVersion = $null
      PackagePlanPresent = $false
    }
  }
}

if (-not (Test-LocalUrl "http://127.0.0.1:5679/health")) {
  Start-Process -FilePath $NpmExe -ArgumentList "run", "dev" -WorkingDirectory (Join-Path $ProjectRoot "vendor\LocalMiniDrama\backend-node") -WindowStyle Hidden
}

if (-not (Test-LocalUrl "http://127.0.0.1:3013")) {
  Start-Process -FilePath $NpmExe -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "3013", "--strictPort" -WorkingDirectory (Join-Path $ProjectRoot "vendor\LocalMiniDrama\frontweb") -WindowStyle Hidden
}

if (-not (Test-LocalUrl "http://127.0.0.1:3765/health")) {
  Start-Process -FilePath $NodeExe -ArgumentList "bridge\server.mjs" -WorkingDirectory $ProjectRoot -WindowStyle Hidden
}

if (-not (Test-LocalUrl "http://127.0.0.1:3000")) {
  $PreviousStudioProjectRoot = $env:ZHIHUI_PROJECT_ROOT
  $env:ZHIHUI_PROJECT_ROOT = $ProjectRoot
  try {
    Start-Process -FilePath $NpmExe -ArgumentList "run", "local:serve" -WorkingDirectory $ProjectRoot -WindowStyle Hidden
  } finally {
    if ($null -eq $PreviousStudioProjectRoot) {
      Remove-Item Env:ZHIHUI_PROJECT_ROOT -ErrorAction SilentlyContinue
    } else {
      $env:ZHIHUI_PROJECT_ROOT = $PreviousStudioProjectRoot
    }
  }
}

$Ready = $false
for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
  if ((Test-LocalUrl "http://127.0.0.1:3000") -and (Test-LocalUrl "http://127.0.0.1:5679/health") -and (Test-LocalUrl "http://127.0.0.1:3013") -and (Test-LocalUrl "http://127.0.0.1:3765/health")) {
    $Ready = $true
    break
  }
  Start-Sleep -Milliseconds 750
}

if (-not $Ready) {
  throw "Local studio startup timed out. Check the Codex terminal for logs."
}

if (-not $NoBrowser) {
  Start-Process "http://127.0.0.1:3000"
}

$BridgeStatus = Get-BridgeProtocolStatus
$StudioBuildStatus = Get-StudioBuildStatus
if ($BridgeStatus.Current -and $StudioBuildStatus.Current) {
  Write-Host "Zhihui local studio is ready at http://127.0.0.1:3000" -ForegroundColor Green
} else {
  if (-not $BridgeStatus.Current) {
    $ReportedVersionLabel = if ($null -eq $BridgeStatus.ReportedVersion) { "unknown" } else { "v$($BridgeStatus.ReportedVersion)" }
    $MissingLabel = $BridgeStatus.MissingCapabilities -join ", "
    Write-Warning "Local services are online, but the bridge is stale (running $ReportedVersionLabel; expected v$ExpectedBridgeProtocol; missing: $MissingLabel)."
  }
  if (-not $StudioBuildStatus.Current) {
    $DraftVersionLabel = if ($null -eq $StudioBuildStatus.ReportedVersion) { "unknown" } else { "v$($StudioBuildStatus.ReportedVersion)" }
    Write-Warning "The studio build is stale (draft protocol $DraftVersionLabel; expected v$ExpectedDraftProtocol; package plan present: $($StudioBuildStatus.PackagePlanPresent))."
  }
  Write-Host "Close the old Zhihui local studio processes and run this launcher again before using engine preflights or draft handoff." -ForegroundColor Yellow
}
