"""Integration check: real, hash-verified Bonsai inference outside the shipping ZIP."""
import hashlib
import json
import pathlib
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


def main():
    package = pathlib.Path(sys.argv[1]).resolve()
    root = pathlib.Path(__file__).resolve().parents[1]
    model = json.loads((root / 'models/prism-catalog.json').read_text(encoding='utf-8'))[0]
    cache = root / 'target/prism-inference'
    cache.mkdir(parents=True, exist_ok=True)
    weights = cache / model['file']
    if not weights.exists():
        partial = weights.with_suffix('.partial')
        subprocess.run(['curl.exe', '-fL', '--retry', '3', model['url'], '-o', str(partial)], check=True)
        partial.replace(weights)
    assert weights.stat().st_size == model['size_bytes'], 'Incorrect model size'
    with weights.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    assert digest == model['sha256'], 'Incorrect model SHA-256'
    assert (package / 'PRISM_ONLY').is_file()
    workspace = json.loads((package / 'PocketAI-data/workspace.json').read_text())
    assert not workspace['chats'] and not workspace['documents']
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    # Bypass corporate proxies for loopback checks.
    http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with (cache / 'server.log').open('w') as log:
        server = subprocess.Popen([
            str(package / 'bin/prism/llama-server.exe'), '-m', str(weights),
            '--host', '127.0.0.1', '--port', str(port), '--device', 'none',
            '-ngl', '0', '-c', '2048', '--no-webui',
        ], stdout=log, stderr=log, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            deadline = time.monotonic() + 300
            while True:
                assert server.poll() is None, 'PrismML exited; inspect target/prism-inference/server.log'
                try:
                    with http.open(base + '/health', timeout=5) as response:
                        if response.status == 200:
                            break
                except (urllib.error.URLError, TimeoutError):
                    pass
                if time.monotonic() >= deadline:
                    raise TimeoutError('Bonsai did not load within 300 seconds')
                time.sleep(1)
            body = json.dumps({'prompt': 'The capital of France is', 'n_predict': 16,
                               'temperature': 0, 'stream': False}).encode()
            request = urllib.request.Request(base + '/completion', data=body,
                                             headers={'Content-Type': 'application/json'})
            with http.open(request, timeout=300) as response:
                result = json.load(response)
            assert result.get('content', '').strip(), result
            assert result.get('tokens_predicted', 0) > 0, result
            print('Bonsai CPU inference:', result['content'])
        finally:
            server.terminate()
            try:
                server.wait(timeout=15)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == '__main__':
    main()
