$ErrorActionPreference = 'Stop'

# Anchor to repo root so relative paths work regardless of where the script is invoked from.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location (Join-Path $ScriptDir '..')

# --- prerequisite: Node.js >= 20 ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed. Download from https://nodejs.org/ (v20 LTS or newer)."
    exit 1
}

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) {
    Write-Error "Node.js v$nodeMajor detected. v20 or newer is required. See https://nodejs.org/."
    exit 1
}

# --- prerequisite: pnpm ---
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "pnpm is not installed. Run: corepack enable"
    exit 1
}

# --- dependency install (skip if already done) ---
if (Test-Path "node_modules/.pnpm") {
    Write-Host "deps already installed, skipping"
} else {
    Write-Host "Installing dependencies..."
    pnpm install --frozen-lockfile
}

# --- build ---
Write-Host "Building workspace packages..."
pnpm -r --filter './packages/*' build

Write-Host "Compiling Electron app..."
pnpm --filter @aipad/desktop build

# --- package ---
Write-Host "Packaging Windows installer..."
pnpm --filter @aipad/desktop dist:win

# --- done ---
$version = node --input-type=module -e "import {readFileSync} from 'fs'; process.stdout.write(JSON.parse(readFileSync('apps/desktop/package.json','utf8')).version)"
Write-Host ""
Write-Host "Done. Installer is at: apps/desktop/release/$version/"
