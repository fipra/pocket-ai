$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw 'Install Node.js 20 or newer on dtiwinai first.'
}
if (-not $env:LLAMA_SERVER) {
    $localLlama = Join-Path $PSScriptRoot 'llama-server.exe'
    if (Test-Path -LiteralPath $localLlama) { $env:LLAMA_SERVER = $localLlama }
    else {
        $installed = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'llama-cuda') -Filter 'llama-server.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($installed) { $env:LLAMA_SERVER = $installed.FullName }
        else { $env:LLAMA_SERVER = 'llama-server.exe' }
    }
}
if (-not (Get-Command $env:LLAMA_SERVER -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath $env:LLAMA_SERVER)) {
    throw 'Set LLAMA_SERVER to the CUDA-enabled llama-server.exe path.'
}
if (-not $env:LLAMANEST_MODELS_DIR) { $env:LLAMANEST_MODELS_DIR = Join-Path $PSScriptRoot 'models' }
if (-not $env:LLAMANEST_PORT) { $env:LLAMANEST_PORT = '8081' }
if (-not $env:LLAMANEST_LLAMA_PORT) { $env:LLAMANEST_LLAMA_PORT = '18089' }
$tokenFile = Join-Path $PSScriptRoot 'token.local.txt'
if (-not $env:LLAMANEST_TOKEN) {
    if (Test-Path -LiteralPath $tokenFile) {
        $env:LLAMANEST_TOKEN = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
    } else {
        $bytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $env:LLAMANEST_TOKEN = [BitConverter]::ToString($bytes).Replace('-', '')
        Set-Content -LiteralPath $tokenFile -Value $env:LLAMANEST_TOKEN -NoNewline
    }
}
if ($env:LLAMANEST_TOKEN.Length -lt 32) { throw 'LLAMANEST_TOKEN must be at least 32 characters.' }
Write-Host "Models: $env:LLAMANEST_MODELS_DIR"
Write-Host "Port: $env:LLAMANEST_PORT"
Write-Host "Browser token saved in: $tokenFile (keep it private)"
if (-not $env:LLAMANEST_TLS_CERT) {
    Write-Warning 'HTTP test mode. For https://llamanest.vercel.app/app/ with dtiwinai.insel.ch, configure LLAMANEST_TLS_CERT and LLAMANEST_TLS_KEY using a trusted certificate.'
}
node.exe (Join-Path $PSScriptRoot 'server.mjs')
