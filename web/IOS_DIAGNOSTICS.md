# iPhone Safari: experimental diagnostic mode

The iPhone link on the landing page opens `/app/?iosdiag=1`. This is an
experimental local test, not a claim that iPhone inference is fixed. Android
phones remain blocked. The normal desktop path and model choices are unchanged.

The actual inference engine is `@wllama/wllama` 3.8.1, a llama.cpp WebAssembly
runtime; the app supplies the matching `@wllama/wllama-compat` fallback assets.
The diagnostic mode requests a CPU backend, one thread, a 512-token context,
a batch of 64 and at most 128 generated tokens. It does not claim those
settings will work on every iPhone or with every model.

The expandable diagnostic log stays in the browser and records environment
capabilities, GGUF file readiness, model/context initialization, tokenizer and
chat-template metadata, reported threads, the generation request and the first
visible decoding output. Native runtime messages are included only for a small
set of relevant loading, context and error events. Sending the request is not
proof that prefill completed; a first visible token is evidence of decoding.
Device memory is frequently unavailable in Safari and browser storage estimates
do not prove enough RAM is available. The log is not automatically uploaded.

On supported Safari CPU and iPhone diagnostic sessions, generation waits up to
90 seconds for the first visible token before aborting and reporting a timeout.
This cannot guarantee recovery if the operating system terminates the browser
or the WebAssembly worker; a model can load yet fail during prefill or decoding.
File download and initialization have separate checks and errors. The tokenizer
metadata and presence of a template are reported, not validated against the
model's intended conversational format.

Automated tests cover the iPhone landing link, retaining the Android gate, and
diagnostic settings. Browser execution on an actual iPhone, including memory
pressure and token generation, is still required. Record iOS version, iPhone
model, browser, exact GGUF, the diagnostic log and whether visible tokens appear.
Use only public or approved test data when sharing logs.
