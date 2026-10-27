$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$tokenFile = Join-Path $PSScriptRoot 'token.local.txt'
if (-not (Test-Path -LiteralPath $tokenFile)) { throw 'Start start-windows.ps1 first so token.local.txt exists.' }
$token = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
$port = if ($env:LLAMANEST_PORT) { $env:LLAMANEST_PORT } else { '8081' }
$base = if ($env:LLAMANEST_TLS_CERT) { "https://dtiwinai.insel.ch:$port" } else { "http://127.0.0.1:$port" }
$headers = @{ Origin = 'https://llamanest.vercel.app'; Authorization = "Bearer $token" }

Write-Host 'Checking LlamaNest bridge and llama-server...'
$available = Invoke-RestMethod -Uri "$base/models" -Headers $headers -TimeoutSec 30
Write-Host "Available models: $($available.models.Count)"

# Small official Hugging Face GGUF, pinned in LlamaNest's Web catalog.
$candidate = @{
    repo = 'QuantFactory/SmolLM2-135M-Instruct-GGUF'
    path = 'SmolLM2-135M-Instruct.Q4_K_M.gguf'
    size = 105454144
    sha256 = '8030f04528538d47bda434f6f0bdf3952c40a58123e4d5e755332f23731a8684'
} | ConvertTo-Json -Compress
Write-Host 'Downloading and verifying the 105 MB test model on dtiwinai...'
$model = Invoke-RestMethod -Method Post -Uri "$base/download" -Headers $headers -ContentType 'application/json' -Body $candidate -TimeoutSec 600
Write-Host "Registered model: $($model.id)"

$request = @{ model = $model.id; messages = @(@{ role = 'user'; content = 'Rispondi solo con OK.' }) } | ConvertTo-Json -Depth 5 -Compress
Write-Host 'Running one streamed inference...'
$response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$base/chat" -Headers $headers -ContentType 'application/json' -Body $request -TimeoutSec 600
$answer = ''
foreach ($line in ($response.Content -split "`n")) {
    if ($line -notmatch '^data: (\{.*\})') { continue }
    $event = $Matches[1] | ConvertFrom-Json
    if ($event.choices -and $event.choices[0].delta.content) { $answer += $event.choices[0].delta.content }
}
if (-not $answer.Trim()) { throw 'The model returned no text. Check the service window for GPU/runtime errors.' }
Write-Host "Model answer: $($answer.Trim())"
Write-Host 'Bridge, verified download and inference all responded.'
