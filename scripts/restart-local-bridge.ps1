param([switch]$Execute)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BridgeHealthUrl = "http://127.0.0.1:3765/health"
$ExpectedProtocol = 3
$ExpectedCapability = "isolated_d1_chain_verification"

function Get-BridgeListenerPid {
  $Line = netstat -ano -p tcp | Select-String -Pattern '^\s*TCP\s+127\.0\.0\.1:3765\s+.*LISTENING\s+(\d+)\s*$' | Select-Object -First 1
  if (-not $Line) { throw "bridge_listener_not_found" }
  return [int]$Line.Matches[0].Groups[1].Value
}

$Health = Invoke-RestMethod -Uri $BridgeHealthUrl -TimeoutSec 3
if ($Health.protocolVersion -eq $ExpectedProtocol -and @($Health.capabilities) -contains $ExpectedCapability) {
  [pscustomobject]@{ status = "already_current"; executeRequested = [bool]$Execute; processMutation = $false; oldPid = $null; newPid = $null; protocolVersion = $Health.protocolVersion } | ConvertTo-Json -Depth 4
  exit 0
}
if ($Health.engines -ne 3 -or ($Health.PSObject.Properties.Name -contains "protocolVersion")) { throw "bridge_signature_changed_abort" }

$BridgePid = Get-BridgeListenerPid
$BridgeProcess = Get-Process -Id $BridgePid -ErrorAction Stop
if ($BridgeProcess.ProcessName -ne "node" -or $BridgeProcess.Path -notlike "*node.exe") { throw "bridge_process_identity_mismatch" }

if (-not $Execute) {
  [pscustomobject]@{ status = "plan_only"; executeRequested = $false; processMutation = $false; oldPid = $BridgePid; processName = $BridgeProcess.ProcessName; executablePath = $BridgeProcess.Path; expectedProtocol = $ExpectedProtocol; expectedCapability = $ExpectedCapability } | ConvertTo-Json -Depth 4
  exit 0
}

Stop-Process -Id $BridgePid -ErrorAction Stop
$NodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$NewProcess = Start-Process -FilePath $NodeExe -ArgumentList "bridge\server.mjs" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
$Verified = $false
for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
  Start-Sleep -Milliseconds 250
  try {
    $Current = Invoke-RestMethod -Uri $BridgeHealthUrl -TimeoutSec 2
    if ($Current.protocolVersion -eq $ExpectedProtocol -and @($Current.capabilities) -contains $ExpectedCapability) { $Verified = $true; break }
  } catch {}
}
if (-not $Verified) { throw "new_bridge_failed_health_check" }
[pscustomobject]@{ status = "restarted"; executeRequested = $true; processMutation = $true; oldPid = $BridgePid; newPid = $NewProcess.Id; protocolVersion = $Current.protocolVersion; verified = $true } | ConvertTo-Json -Depth 4
