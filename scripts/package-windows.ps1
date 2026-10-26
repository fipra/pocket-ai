$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  cargo build --release --locked
  if ($LASTEXITCODE -ne 0) { throw 'Rust build failed' }
  $llama = (Get-Command llama-cli.exe -ErrorAction Stop).Source
  $llamaServer = (Get-Command llama-server.exe -ErrorAction Stop).Source
  $llamaQuantize = (Get-Command llama-quantize.exe -ErrorAction Stop).Source
  $pdf = (Get-Command pdftotext.exe -ErrorAction Stop).Source
  $out = Join-Path $root 'release\USB-AI-Rust-Windows-x64'
  $bin = Join-Path $out 'bin'
  $gpuRuntime = $env:USB_AI_VULKAN_RUNTIME_DIR
  $data = Join-Path $out 'PocketAI-data'
  foreach ($refreshed in @($bin, (Join-Path $out 'models'))) {
    if (Test-Path $refreshed) { Remove-Item $refreshed -Recurse -Force }
  }
  New-Item $bin -ItemType Directory -Force | Out-Null
  New-Item (Join-Path $out 'models') -ItemType Directory -Force | Out-Null
  New-Item $data -ItemType Directory -Force | Out-Null
  $workspaceFile = Join-Path $data 'workspace.json'
  if (-not (Test-Path $workspaceFile)) {
    $workspace = @{ chats = @(); documents = @() }
    [System.IO.File]::WriteAllText($workspaceFile, ($workspace | ConvertTo-Json -Depth 100), (New-Object System.Text.UTF8Encoding($false)))
  }
  Copy-Item (Join-Path $root 'target\release\usb-ai-rust.exe') $bin
  Copy-Item $llama $bin
  Copy-Item $llamaServer $bin
  Copy-Item $llamaQuantize $bin
  Copy-Item $pdf $bin
  foreach ($toolDir in @((Split-Path $llama), (Split-Path $llamaServer), (Split-Path $llamaQuantize), (Split-Path $pdf)) | Select-Object -Unique) {
    Get-ChildItem $toolDir -Filter '*.dll' | Copy-Item -Destination $bin -Force
  }
  if ($gpuRuntime) {
    $gpuServer = Join-Path $gpuRuntime 'llama-server.exe'
    $vulkanBackend = Join-Path $gpuRuntime 'ggml-vulkan.dll'
    if (!(Test-Path $gpuServer) -or !(Test-Path $vulkanBackend)) {
      throw 'Vulkan runtime is missing llama-server.exe or ggml-vulkan.dll'
    }
    $gpuBin = Join-Path $bin 'gpu'
    New-Item $gpuBin -ItemType Directory -Force | Out-Null
    Copy-Item $gpuServer $gpuBin
    Get-ChildItem $gpuRuntime -Filter '*.dll' -File | Copy-Item -Destination $gpuBin -Force
    $openMpLicense = Join-Path $gpuRuntime 'LICENSE-LLVM-OpenMP'
    if (Test-Path $openMpLicense) { Copy-Item $openMpLicense $gpuBin }
    @'
@echo off
setlocal
set "GPU_SERVER=%~dp0bin\gpu\llama-server.exe"
"%GPU_SERVER%" --list-devices 2>nul | findstr /C:"Vulkan" >nul
if errorlevel 1 (
  echo No Vulkan GPU detected. Starting with CPU.
) else (
  set "LLAMA_SERVER=%GPU_SERVER%"
  echo Vulkan GPU detected. Starting with GPU acceleration.
)
"%~dp0bin\usb-ai-rust.exe"
'@ | Set-Content (Join-Path $out 'Avvia USB AI Rust GPU.cmd')
  }
  Get-ChildItem (Join-Path $root 'models') -Filter '*.gguf' | Copy-Item -Destination (Join-Path $out 'models')
  foreach ($name in @('QWEN-LICENSE.txt','catalog.json')) {
    $file = Join-Path (Join-Path $root 'models') $name
    if (Test-Path $file) { Copy-Item $file (Join-Path $out 'models') }
  }
  foreach ($name in @('LICENSE','LICENSE-MIT-LEGACY','COMMERCIAL_LICENSE.md','LICENSING_HISTORY.md')) {
    Copy-Item (Join-Path $root $name) (Join-Path $out $name)
  }
  '@echo off' + "`r`n" + '"%~dp0bin\usb-ai-rust.exe"' | Set-Content (Join-Path $out 'Avvia USB AI Rust.cmd')
  @'
Double-click Avvia USB AI Rust.cmd. The browser opens at 127.0.0.1.
If Avvia USB AI Rust GPU.cmd is present, use it to try Vulkan GPU acceleration.
The GPU launcher uses the CPU runtime when no Vulkan GPU is detected.
Keep the whole folder on the USB drive. Models and data stay here.
Build this package on a Windows x64 computer with Rust, llama-server, llama-cli, llama-quantize and pdftotext.
'@ | Set-Content (Join-Path $out 'README.txt')
  Write-Host "Portable folder ready: $out"
} finally { Pop-Location }
