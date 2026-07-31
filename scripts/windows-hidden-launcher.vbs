Option Explicit

Dim mode, executablePath, targetPath, command, shell, exitCode

If WScript.Arguments.Count < 3 Then
  WScript.Quit 87
End If

mode = LCase(CStr(WScript.Arguments(0)))
executablePath = CStr(WScript.Arguments(1))
targetPath = CStr(WScript.Arguments(2))
command = QuoteArgument(executablePath) & " " & QuoteArgument(targetPath)

Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(command, 0, True)

If exitCode <> 0 And mode = "alert" Then
  shell.Popup "PowerGym detected a health-check problem. Review logs\monitor.log and the service status.", 30, "PowerGym health alert", 48
End If

WScript.Quit exitCode

Function QuoteArgument(ByVal value)
  QuoteArgument = Chr(34) & CStr(value) & Chr(34)
End Function
