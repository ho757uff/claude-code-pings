# Claude Code Pings - PreToolUse hook for AskUserQuestion
# Writes a signal so the VS Code extension can play the question sound.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path (Join-Path $env:USERPROFILE '.claude') 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-pings-muted'
$signalFile = Join-Path $hooksDir 'claude-pings-signal'

# Read stdin (required by hook protocol)
$null = [Console]::In.ReadToEnd()

# Skip if muted
if (Test-Path $muteFlag) { exit 0 }

# Write signal: "question <timestamp_ms>"
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Set-Content -Path $signalFile -Value "question $timestamp" -NoNewline

exit 0
