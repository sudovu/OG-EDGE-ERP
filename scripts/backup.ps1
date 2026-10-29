param(
  [string]$DbPath = "C:\Users\Sudo\OG-EDGE ERP\backend\data\og-edge.db",
  [string]$BackupDir = "C:\Users\Sudo\OG-EDGE ERP\backups"
)
if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }
$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$out = Join-Path $BackupDir "og-edge-$ts.db"
sqlite3 $DbPath ".backup $out"
Write-Host "Backup written to $out"