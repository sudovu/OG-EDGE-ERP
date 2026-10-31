param(
  [string]$DbPath = $env:DB_PATH,
  [string]$BackupDir = $env:BACKUP_DIR
)
if (-not $DbPath) { $DbPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\backend\data\og-edge.db"; $DbPath = Resolve-Path $DbPath }
if (-not $BackupDir) { $BackupDir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\backups" }
if (!(Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }
$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$out = Join-Path $BackupDir "og-edge-$ts.db"
sqlite3 $DbPath ".backup $out"
Write-Host "Backup written to $out"