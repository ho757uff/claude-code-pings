$sig = Join-Path $env:USERPROFILE '.claude\hooks\claude-pings-signal'

Write-Host "=== Test 3 sons consecutifs ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] question..." -ForegroundColor Yellow
Set-Content $sig "question $([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -NoNewline
Start-Sleep 2

Write-Host "[2/3] permission..." -ForegroundColor Yellow
Set-Content $sig "permission $([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -NoNewline
Start-Sleep 2

Write-Host "[3/3] done..." -ForegroundColor Yellow
Set-Content $sig "done $([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -NoNewline

Write-Host ""
Write-Host "Les 3 sons etaient-ils au meme volume ?" -ForegroundColor Green
