# Führt alle Server-Tests nacheinander aus, jeweils mit frischer lokaler Datenbank.
# Aufruf im Ordner server:  powershell -ExecutionPolicy Bypass -File test\all.ps1
param([string[]]$Tests = @('run.mjs', 'intervals.mjs'))
$ErrorActionPreference = 'Continue'
$mock = Start-Process node -ArgumentList 'test/mock-intervals.mjs' -PassThru -WindowStyle Hidden
$failed = 0
foreach ($t in $Tests) {
  Remove-Item -Recurse -Force .wrangler\state -ErrorAction SilentlyContinue
  npx.cmd wrangler d1 execute ironman --local --file=schema.sql *> $null
  $dev = Start-Process npx.cmd -ArgumentList 'wrangler dev --local --port 8787' -PassThru -WindowStyle Hidden
  for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest http://localhost:8787/api/health -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep 1 } }
  Write-Output "=== $t ==="
  node "test/$t"
  if ($LASTEXITCODE -ne 0) { $failed++ }
  taskkill /PID $dev.Id /T /F *> $null
  Start-Sleep 2
}
taskkill /PID $mock.Id /T /F *> $null
if ($failed) { Write-Output "$failed Testdatei(en) fehlgeschlagen"; exit 1 } else { Write-Output 'ALLE TESTDATEIEN BESTANDEN' }
