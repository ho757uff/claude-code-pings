# Claude Code Pings - Stop hook (with dedup guard)
# Writes a "done" signal unless another hook already signaled recently.
$ErrorActionPreference = 'SilentlyContinue'

$hooksDir = Join-Path (Join-Path $env:USERPROFILE '.claude') 'hooks'
$muteFlag = Join-Path $hooksDir 'claude-pings-muted'
$signalFile = Join-Path $hooksDir 'claude-pings-signal'

# Read stdin (required by hook protocol)
$null = [Console]::In.ReadToEnd()

# Skip if muted
if (Test-Path $muteFlag) { exit 0 }

# Dedup guard: skip if a signal was written less than 2 seconds ago
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if (Test-Path $signalFile) {
    $content = Get-Content $signalFile -Raw
    if ($content) {
        $parts = $content.Trim().Split(' ')
        if ($parts.Count -ge 2) {
            try {
                $lastTimestamp = [long]$parts[1]
                $elapsed = $now - $lastTimestamp
                if ($elapsed -lt 2000) {
                    # Another hook already signaled recently, skip
                    exit 0
                }
            } catch {}
        }
    }
}

# Write signal: "done <timestamp_ms>"
Set-Content -Path $signalFile -Value "done $now" -NoNewline

exit 0
