#!/usr/bin/env python3
"""Build a relocatable macOS USB AI Rust folder on the current Mac."""
import os
import pathlib
import json
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "release" / f"USB-AI-Rust-mac-{os.uname().machine}"
BIN = OUT / "bin"
LIB = OUT / "lib"


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def dependencies(source):
    lines = run("otool", "-L", str(source)).splitlines()[1:]
    return [line.strip().split(" (compatibility version", 1)[0] for line in lines]


def resolve(source, dep):
    if dep.startswith(("/usr/lib/", "/System/Library/")):
        return None
    if dep.startswith("@rpath/"):
        name = pathlib.Path(dep).name
        candidates = [source.parent / name, source.parent.parent / "lib" / name,
                      pathlib.Path("/opt/homebrew/lib") / name, pathlib.Path("/usr/local/lib") / name]
    elif dep.startswith("@loader_path/"):
        candidates = [source.parent / dep.removeprefix("@loader_path/")]
    elif dep.startswith("@executable_path/"):
        candidates = [source.parent / dep.removeprefix("@executable_path/")]
    else:
        candidates = [pathlib.Path(dep)]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError(f"Dependency not found: {dep} (from {source})")


def main():
    subprocess.run(["cargo", "build", "--release", "--locked"], cwd=ROOT, check=True)
    tools = {"llama-cli": shutil.which("llama-cli"), "pdftotext": shutil.which("pdftotext")}
    for name, path in tools.items():
        if not path:
            raise RuntimeError(f"Missing {name}; install llama.cpp and poppler first")
    for refreshed in [BIN, LIB, OUT / "models"]:
        if refreshed.exists():
            shutil.rmtree(refreshed)
    BIN.mkdir(parents=True)
    LIB.mkdir()
    (OUT / "models").mkdir()
    data_dir = OUT / "PocketAI-data"
    data_dir.mkdir(exist_ok=True)
    workspace = data_dir / "workspace.json"
    saved = json.loads(workspace.read_text()) if workspace.exists() else {"documents": []}
    saved["chats"] = []
    workspace.write_text(json.dumps(saved, ensure_ascii=False, indent=2))
    queue = []
    for name, source in {"usb-ai-rust": ROOT / "target/release/usb-ai-rust", **tools}.items():
        source = pathlib.Path(source).resolve()
        target = BIN / name
        shutil.copy2(source, target)
        target.chmod(target.stat().st_mode | 0o200)
        queue.append((source, target, False))
    seen = set()
    signed = []
    while queue:
        source, target, library = queue.pop(0)
        if target in seen:
            continue
        seen.add(target)
        deps = dependencies(source)
        for dep in deps:
            resolved = resolve(source, dep)
            if resolved is None:
                continue
            name = pathlib.Path(dep).name
            child = LIB / name
            if not child.exists():
                shutil.copy2(resolved, child)
                child.chmod(child.stat().st_mode | 0o200)
            queue.append((resolved, child, True))
            new = f"@loader_path/{name}" if library else f"@loader_path/../lib/{name}"
            run("install_name_tool", "-change", dep, new, str(target))
        if library:
            run("install_name_tool", "-id", f"@loader_path/{target.name}", str(target))
        signed.append(target)
    for path in signed:
        run("codesign", "--force", "--sign", "-", str(path))
        run("codesign", "--verify", "--strict", str(path))
    for model in (ROOT / "models").glob("*.gguf"):
        dest = OUT / "models" / model.name
        try:
            run("cp", "-c", str(model), str(dest))
        except subprocess.CalledProcessError:
            shutil.copy2(model, dest)
    for name in ["QWEN-LICENSE.txt", "catalog.json"]:
        source = ROOT / "models" / name
        if source.is_file():
            shutil.copy2(source, OUT / "models" / name)
    launcher = OUT / "Avvia USB AI Rust.command"
    shutil.copy2(ROOT / "scripts/mac-launcher.command", launcher)
    launcher.chmod(0o755)
    (OUT / "LEGGIMI.txt").write_text(
        "Doppio clic su Avvia USB AI Rust.command. Il browser si apre su 127.0.0.1.\n"
        "Al primo avvio il launcher verifica i binari inclusi e rimuove la loro quarantena.\n"
        "Tieni la cartella sulla chiavetta USB; dati e modelli restano qui.\n"
        "Questa build funziona solo su macOS con la stessa architettura indicata nel nome.\n"
        "Non e' firmata con un certificato Apple: macOS puo' chiedere di autorizzarla.\n"
    )
    print(f"Portable folder ready: {OUT}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"Packaging failed: {exc}", file=sys.stderr)
        sys.exit(1)
