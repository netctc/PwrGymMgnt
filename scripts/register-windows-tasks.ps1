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

foreach ($requiredPath in @($ProjectDirectory, $NodePath, $runnerPath, $monitorPath)) {
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

$serviceAction = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "`"$runnerPath`"" `
  -WorkingDirectory $ProjectDirectory
$serviceTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$serviceSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$healthAction = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "`"$monitorPath`"" `
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
  -MultipleInstances IgnoreNew

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
if ($registeredAction.Execute -ne $NodePath) {
  throw "PowerGym task executable was registered incorrectly: $($registeredAction.Execute)"
}
if ($registeredAction.WorkingDirectory -ne $ProjectDirectory) {
  throw "PowerGym task working directory was registered incorrectly: $($registeredAction.WorkingDirectory)"
}

Write-Host "Windows scheduled tasks registered for $currentUser."
Write-Host "PowerGym executable: $($registeredAction.Execute)"
Write-Host "PowerGym working directory: $($registeredAction.WorkingDirectory)"
