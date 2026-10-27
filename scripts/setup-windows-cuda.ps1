$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$venv = Join-Path $root 'PocketAI-data\cuda-venv'
$python = Join-Path $venv 'Scripts\python.exe'

if (!(Test-Path $python)) {
  $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($launcher) {
    & $launcher.Source -3.11 -m venv $venv
  } else {
    $installed = Get-Command python.exe -ErrorAction SilentlyContinue
    if (!$installed) { throw 'Install Python 3.11, then run this setup again.' }
    & $installed.Source -c "import sys; assert sys.version_info[:2] == (3, 11), 'Python 3.11 is required'"
    if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.11, then run this setup again.' }
    & $installed.Source -m venv $venv
  }
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the CUDA Python environment.' }
}

& $python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Could not update pip.' }
& $python -m pip install torch --index-url https://download.pytorch.org/whl/cu118
if ($LASTEXITCODE -ne 0) { throw 'Could not install CUDA PyTorch.' }
& $python -m pip install 'transformers>=4.57,<5' 'peft>=0.12,<1' 'accelerate>=0.34,<2' 'bitsandbytes>=0.45,<1' gguf sentencepiece protobuf tiktoken numpy safetensors pyyaml requests tqdm
if ($LASTEXITCODE -ne 0) { throw 'Could not install the training and conversion packages.' }
& $python -c "import torch, transformers, peft, bitsandbytes; print('CUDA GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'unavailable'); assert torch.cuda.is_available(), 'PyTorch cannot access the NVIDIA GPU'"
if ($LASTEXITCODE -ne 0) { throw 'CUDA is unavailable. Update the NVIDIA driver or choose a compatible PyTorch CUDA build.' }
Write-Host 'Fine tuning GPU tools are ready. Restart LlamaNest, then choose a model folder in Laboratory.'
