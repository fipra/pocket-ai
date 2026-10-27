$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

# Official llama.cpp b11852 Windows CUDA 12 release assets and their published attestation digests.
$release = 'b11852'
$assets = @(
    @{ Name = 'llama-b11852-bin-win-cuda-12.4-x64.zip'; Sha256 = 'a14153028a77da9e4f92260d02b6e2c2595aee4b57354cdb928bfd2472fc3f53' },
    @{ Name = 'cudart-llama-bin-win-cuda-12.4-x64.zip'; Sha256 = '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6' }
)
$downloadDir = Join-Path $PSScriptRoot 'downloads'
$installDir = Join-Path $PSScriptRoot 'llama-cuda'
New-Item -ItemType Directory -Path $downloadDir, $installDir -Force | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

foreach ($asset in $assets) {
    $zip = Join-Path $downloadDir $asset.Name
    $valid = (Test-Path -LiteralPath $zip) -and ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -eq $asset.Sha256)
    if (-not $valid) {
        $url = "https://github.com/ggml-org/llama.cpp/releases/download/$release/$($asset.Name)"
        Write-Host "Downloading $($asset.Name)..."
        try {
            Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -ErrorAction Stop
        } catch {
            throw "GitHub download blocked. Save $($asset.Name) from $url with a browser into $downloadDir, then run this script again. The corporate firewall may require authentication."
        }
    }
    $actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $asset.Sha256) { throw "SHA-256 mismatch for $($asset.Name). Expected $($asset.Sha256), got $actual" }
    Write-Host "Verified $($asset.Name). Extracting..."
    Expand-Archive -LiteralPath $zip -DestinationPath $installDir -Force
}

$server = Get-ChildItem -LiteralPath $installDir -Filter 'llama-server.exe' -File -Recurse | Select-Object -First 1
if (-not $server) { throw 'The CUDA package did not contain llama-server.exe.' }
Write-Host "llama-server.exe: $($server.FullName)"
& $server.FullName --list-devices
if ($LASTEXITCODE -ne 0) { throw 'llama-server.exe could not start. Check the NVIDIA driver and CUDA DLLs.' }
Write-Host 'CUDA runtime installed. Run .\start-windows.ps1 next.'
