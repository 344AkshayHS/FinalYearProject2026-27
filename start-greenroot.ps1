# Starts GreenRoot on this PC (double-click "Start GreenRoot.bat", which runs this file):
#   1. the ML service, for this PC only (127.0.0.1:8000)
#   2. the backend, which also serves the website (port 4000)
#   3. the ngrok tunnel to PUBLIC_URL in backend\.env: one fixed https address, so any phone with internet
#      (mobile data or any Wi-Fi) reaches this PC, whatever this PC's own address is
# Without ngrok or PUBLIC_URL, step 3 is skipped and only phones on this PC's Wi-Fi can use GreenRoot.
# Each part opens in its own window. To stop GreenRoot, close those windows.
# PostgreSQL must be running (it starts with Windows when installed as a service).

param([switch]$NoBrowser) # -NoBrowser: do not open the website at the end

$root = $PSScriptRoot
$backendEnv = Join-Path $root 'backend\.env'

function Setting($name) {
  $line = Get-Content $backendEnv | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if ($line) { return ($line -split '=', 2)[1].Trim() }
  return $null
}

function Listening($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function OpenWindow($title, $folder, $command) {
  Start-Process powershell -WorkingDirectory (Join-Path $root $folder) -ArgumentList '-NoExit', '-Command',
    "`$Host.UI.RawUI.WindowTitle = '$title'; $command"
}

if (-not (Test-Path $backendEnv)) {
  Write-Host 'backend\.env is missing: copy backend\.env.example to backend\.env and fill it in (README, step 3).'
  exit 1
}
$port = Setting 'PORT'
if (-not $port) { $port = '4000' }
$publicUrl = Setting 'PUBLIC_URL'
if ($publicUrl -and $publicUrl -notmatch '^https?://') { $publicUrl = "https://$publicUrl" } # written without https://
$publicUrl = if ($publicUrl) { $publicUrl -replace '/+$', '' }
# ngrok from winget is found even before Windows passes the new PATH on (a double-click right after installing)
$ngrok = (Get-Command ngrok -ErrorAction SilentlyContinue).Source
$wingetNgrok = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ngrok.exe'
if (-not $ngrok -and (Test-Path $wingetNgrok)) { $ngrok = $wingetNgrok }
$hasNgrok = [bool]$ngrok
$tunnel = $publicUrl -and $hasNgrok

# The backend serves the website once it is built
if (-not (Test-Path (Join-Path $root 'web\dist\index.html'))) {
  Write-Host 'Building the website (first time only)...'
  Push-Location (Join-Path $root 'web')
  npm run build
  Pop-Location
}

# 1. ML service
if (Listening 8000) {
  Write-Host 'ML service: already running.'
} else {
  OpenWindow 'GreenRoot ML service' 'ml-service' '.venv\Scripts\python -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000'
}

# 2. Backend. Behind the tunnel it reads each phone's own address from ngrok (TRUST_PROXY, so the request
#    limits count per person) and sends the website's login cookie over https only (COOKIE_SECURE).
if (Listening $port) {
  Write-Host "Backend: already running on port $port."
} else {
  $behindTunnel = ''
  if ($tunnel) { $behindTunnel = "`$env:TRUST_PROXY = '1'; `$env:COOKIE_SECURE = 'true'; `$env:PUBLIC_URL = '$publicUrl'; " }
  OpenWindow 'GreenRoot backend' 'backend' "$behindTunnel node --env-file=.env src/server.js"
}

# 3. The tunnel
if ($tunnel) {
  # --domain takes the name without https:// and works in old and new ngrok versions
  $domain = $publicUrl -replace '^https?://', '' -replace '/+$', ''
  OpenWindow 'GreenRoot internet tunnel (ngrok)' '.' "& '$ngrok' http $port --domain=$domain"
}

# Wait for the backend to answer
$ready = $false
for ($i = 0; $i -lt 30 -and -not $ready; $i++) {
  Start-Sleep -Seconds 2
  try { $ready = (Invoke-WebRequest "http://localhost:$port/api/" -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 } catch { }
}

Write-Host ''
if (-not $ready) {
  Write-Host 'The backend did not start. Look at the "GreenRoot backend" window for the reason.'
  exit 1
}
Write-Host 'GreenRoot is running.'
Write-Host "  On this PC:          http://localhost:$port"
# The address the Wi-Fi or hotspot gave this PC (not the virtual ones of VirtualBox and the like)
$wifi = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }
foreach ($address in $wifi) { Write-Host "  On the same Wi-Fi:    http://$($address.IPAddress):$port" }
if ($tunnel) {
  Write-Host "  From any phone:       $publicUrl   (the app uses this address)"
} elseif (-not $hasNgrok) {
  Write-Host '  From any phone:       not set up (ngrok is not installed, see the README)'
} else {
  Write-Host '  From any phone:       not set up (PUBLIC_URL is missing in backend\.env, see the README)'
}
Write-Host 'The ML service needs about 20 seconds more to load the model. Close the GreenRoot windows to stop.'
if (-not $NoBrowser) { Start-Process "http://localhost:$port" }
