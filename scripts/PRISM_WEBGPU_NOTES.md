# Prism WebGPU prototype

The prototype uses wllama with PrismML llama.cpp commit `5628c7338963b00a598f2a588fd09a79af6d70db`, WebGPU and the experimental modifications in `prism-webgpu-runtime.patch`. The browser build uses JSPI and wasm64. Its build-time C++ diagnostic callback emits abort messages to the worker. The runtime archive contains compiled code only, no model weights or user data.

On a MacBook M2 and Chrome, Bonsai 2 2B PQ2_0 loaded 25/25 layers on WebGPU and answered a simple arithmetic question correctly. Bonsai 2 9B PQ2_0 loaded 33/33 layers on WebGPU, produced two coherent answers, and generated about 1.5–1.6 tokens per second in those tests. These are preliminary observations, not a benchmark or general compatibility guarantee.

WebGPU rejected overlapping writable bindings in the gated-delta-net kernel. The prototype schedules that operation on the CPU; other operations and model layers use WebGPU. This hybrid execution adds transfers and is slow. A separate test using read-only inputs still encountered incompatible buffer usage within a synchronization scope. Do not claim full GPU execution.

`build-prism-webgpu.py` generates a separate `/prism-gpu/` app and keeps its browser database and service-worker cache separate from the standard app. It rejects missing GPU offload and requires Chrome JSPI. Individual GGUF files above 3 GB still require splitting. The test covered a 2.3 GB 9B file; other models, browsers, machines and large contexts require further testing. Never replace the stable app with this experiment.
