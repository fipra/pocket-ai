# LlamaNest LAN GPU service (Web prototype)

This service runs on `dtiwinai`. It downloads a selected single-file GGUF from Hugging Face directly into its `models` directory, checks the published byte count and SHA-256, and starts a CUDA-enabled `llama-server` on loopback. The browser only sends chat requests and receives streamed answers. The service uses Node.js 20+ built-ins; no npm install is needed.

## Windows test on dtiwinai

1. Copy this entire `remote/` directory to `dtiwinai` and install Node.js 20+ there.
2. In `C:\remote`, run `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-llama-cuda.ps1`. This downloads the official Windows CUDA 12 llama.cpp binaries and CUDA runtime from release `b11852`, checks both published SHA-256 hashes, extracts them, and runs `llama-server.exe --list-devices`. You should see an NVIDIA CUDA device. If you already have a CUDA-enabled build, set `$env:LLAMA_SERVER` to its path instead.

   If the corporate firewall blocks PowerShell downloads, download these two files in a browser on `dtiwinai` and save both, with their original names, in `C:\remote\downloads`:

   - [llama-b11852-bin-win-cuda-12.4-x64.zip](https://github.com/ggml-org/llama.cpp/releases/download/b11852/llama-b11852-bin-win-cuda-12.4-x64.zip)
   - [cudart-llama-bin-win-cuda-12.4-x64.zip](https://github.com/ggml-org/llama.cpp/releases/download/b11852/cudart-llama-bin-win-cuda-12.4-x64.zip)

   Run `install-llama-cuda.ps1` again. It checks both SHA-256 hashes before extracting. If the browser is also blocked, the network administrator must allow those files or supply the binaries through an approved internal channel.
3. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\start-windows.ps1` from the copied directory. The script finds the installed binary, creates a stable random token in `token.local.txt`, and listens on port 8081. Keep the terminal open. Do not share the token in chat or screenshots.
4. Check `http://localhost:8081/health` on `dtiwinai` using `curl.exe -H "Origin: https://llamanest.vercel.app" -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8081/health`. This confirms the bridge is running. `GET /models` additionally requires a working `llama-server`.

For an end-to-end test, keep the service running in its first window and open a second PowerShell window in `C:\remote`. Run `powershell -NoProfile -ExecutionPolicy Bypass -File .\test-gpu.ps1`. It downloads a pinned 105 MB SmolLM2 GGUF on `dtiwinai`, verifies it, and sends one chat request. The first inference may take a while while the GPU loads the model.

The model directory defaults to `remote/models`. Set `LLAMANEST_MODELS_DIR` before running the script if the models should live elsewhere. The folder may also contain your own exported GGUF; restart the service to make an already copied file visible. The service starts `llama-server` in router mode with GPU layers set to `all`.

## Connecting the public HTTPS site

`dtiwinai` currently resolves to `dtiwinai.insel.ch` at `161.62.136.186`. Since that is not a private IP, browsers will block `https://llamanest.vercel.app/app/` from contacting `http://dtiwinai:8081`. Use a trusted HTTPS certificate for `dtiwinai.insel.ch` or a secure HTTPS reverse proxy/tunnel to the service. Set `LLAMANEST_TLS_CERT` and `LLAMANEST_TLS_KEY` to PEM certificate and private-key paths before launching, then connect the Web app to `https://dtiwinai.insel.ch:8081`. The certificate must be trusted by the browser, the selected port must be reachable, and the site's updated Web build must be deployed.

The browser asks for the service URL and the generated token in **Models → LAN GPU server**. Search Hugging Face as usual and choose **Save on dtiwinai**. The model downloads on `dtiwinai`, not onto the browsing device. The access token is saved in the browser's local IndexedDB settings without encryption. Keep the service restricted to trusted clients and do not put it on an unrestricted public port.

The current browser search download handles one GGUF file per model. To use an existing split GGUF set, copy all its shards into the server's models folder and restart the service; the bridge lists the complete set as one model using its first shard. Browser-to-server upload of your own file is not implemented yet; you can copy an exported GGUF into the server's models folder manually. The model's license remains applicable. Prompts and retrieved document excerpts travel to `dtiwinai` when a remote model is selected.
