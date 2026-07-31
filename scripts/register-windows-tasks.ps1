param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectDirectory,

  [Parameter(Mandatory = $true)]
  [string]$NodePath,

  [switch]$StartService
)

$ErrorActionPreference = 'Stop'
$serviceName = 'PowerGym'
$healthTaskName = 'PowerGym-Health'
$runnerPath = Join-Path $ProjectDirectory 'scripts\service-runner.mjs'
$monitorPath = Join-Path $ProjectDirectory 'scripts\monitor-installation.mjs'
$hiddenLauncherPath = Join-Path $ProjectDirectory 'scripts\windows-hidden-launcher.vbs'
$wscriptPath = Join-Path $env:SystemRoot 'System32\wscript.exe'

foreach ($requiredPath in @($ProjectDirectory, $NodePath, $runnerPath, $monitorPath, $hiddenLauncherPath, $wscriptPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required path was not found: $requiredPath"
  }
}

$currentIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$currentPrincipal = New-Object System.Security.Principal.WindowsPrincipal($currentIdentity)
$administratorRole = [System.Security.Principal.WindowsBuiltInRole]::Administrator
if (-not $currentPrincipal.IsInRole($administratorRole)) {
  throw 'Administrator privileges are required. Open Command Prompt as administrator and run npm run ops:service-repair:windows again.'
}

$currentUser = $currentIdentity.Name
$principal = New-ScheduledTaskPrincipal `
  -UserId $currentUser `
  -LogonType Interactive `
  -RunLevel Limited

$serviceArguments = "`"$hiddenLauncherPath`" silent `"$NodePath`" `"$runnerPath`""
$serviceAction = New-ScheduledTaskAction `
  -Execute $wscriptPath `
  -Argument $serviceArguments `
  -WorkingDirectory $ProjectDirectory
$serviceTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$serviceSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -Hidden

$healthArguments = "`"$hiddenLauncherPath`" alert `"$NodePath`" `"$monitorPath`""
$healthAction = New-ScheduledTaskAction `
  -Execute $wscriptPath `
  -Argument $healthArguments `
  -WorkingDirectory $ProjectDirectory
$healthTrigger = New-ScheduledTaskTrigger `
  -Once `
  -At ((Get-Date).AddMinutes(1)) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$healthSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
  -MultipleInstances IgnoreNew `
  -Hidden

foreach ($taskName in @($serviceName, $healthTaskName)) {
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  }
}

Register-ScheduledTask `
  -TaskName $serviceName `
  -Action $serviceAction `
  -Trigger $serviceTrigger `
  -Principal $principal `
  -Settings $serviceSettings `
  -Force | Out-Null

Register-ScheduledTask `
  -TaskName $healthTaskName `
  -Action $healthAction `
  -Trigger $healthTrigger `
  -Principal $principal `
  -Settings $healthSettings `
  -Force | Out-Null

if ($StartService) {
  Start-ScheduledTask -TaskName $serviceName
}

$registeredAction = (Get-ScheduledTask -TaskName $serviceName).Actions | Select-Object -First 1
if ($registeredAction.Execute -ne $wscriptPath) {
  throw "PowerGym task executable was registered incorrectly: $($registeredAction.Execute)"
}
if ($registeredAction.WorkingDirectory -ne $ProjectDirectory) {
  throw "PowerGym task working directory was registered incorrectly: $($registeredAction.WorkingDirectory)"
}

Write-Host "Windows scheduled tasks registered for $currentUser."
Write-Host "PowerGym hidden launcher: $($registeredAction.Execute)"
Write-Host "PowerGym Node.js runtime: $NodePath"
Write-Host "PowerGym working directory: $($registeredAction.WorkingDirectory)"
