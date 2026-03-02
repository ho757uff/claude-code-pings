# Claude Code Pings - PermissionRequest hook
# Writes a signal so the VS Code extension can play the permission sound.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path ($env:USERPROFILE) '.claude' 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-pings-muted'
$signalFile = Join-Path $hooksDir 'claude-pings-signal'

# Read stdin
$raw = [Console]::In.ReadToEnd()
try { $data = $raw | ConvertFrom-Json } catch { exit 0 }

# Skip if muted
if (Test-Path $muteFlag) { exit 0 }

# Skip AskUserQuestion (handled by the question hook)
if ($data.tool_name -eq 'AskUserQuestion') { exit 0 }

# Write signal: "permission <timestamp_ms>"
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Set-Content -Path $signalFile -Value "permission $timestamp" -NoNewline

exit 0
