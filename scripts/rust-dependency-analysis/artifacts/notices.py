"""Conservatively include all locked Cargo dependency licenses, including build tools."""
import hashlib
import json
from pathlib import Path
import subprocess

OXC_REVISION = "7f56ec9301e7327b4402c3010c87803b58b6ea30"


def notices(root, target):
    license_root = Path(__file__).parent / "licenses"
    for entry in json.loads((license_root / "sources.json").read_text()):
        if Path(entry["name"]).name != entry["name"] or hashlib.sha256((license_root / entry["name"]).read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError("vendored license checksum mismatch")
    metadata = json.loads(subprocess.check_output(["cargo", "metadata", "--locked", "--offline", "--format-version", "1"], cwd=root / "native", text=True))
    blocks = ["Third-party notices for bit-dependency-scanner\nIncludes conservative locked build/runtime dependency inventory.\n"]
    fallback = Path(__file__).parent / "licenses" / "oxc-MIT.txt"
    for package in sorted(metadata["packages"], key=lambda item: (item["name"], item["version"])):
        if package["source"] is None:
            continue
        directory = Path(package["manifest_path"]).parent
        files = sorted(file for file in directory.iterdir() if file.is_file() and file.name.upper().startswith(("LICENSE", "COPYING", "NOTICE")))
        if not files and package["name"].startswith("oxc_"):
            vcs = json.loads((directory / ".cargo_vcs_info.json").read_text())
            expected_revision = "8e09fe324eb6df02f56e4eacdfac958930300380" if package["name"] == "oxc_index" else OXC_REVISION
            if vcs["git"]["sha1"] != expected_revision or package["license"] != "MIT":
                raise ValueError("OXC license fallback revision mismatch")
            files = [fallback.with_name("oxc-index-MIT.txt") if package["name"] == "oxc_index" else fallback]
        if not files:
            raise ValueError(f"missing license text: {package['name']} {package['version']}")
        blocks.append(f"\n=== {package['name']} {package['version']} ===\nSPDX: {package['license']}\nRepository: {package.get('repository') or ''}\n")
        for file in files:
            blocks.append(f"\n--- {file.name} (SHA256 {hashlib.sha256(file.read_bytes()).hexdigest()}) ---\n" + file.read_text(encoding="utf-8"))
    compiler = subprocess.check_output(["rustc", "-vV"], cwd=root / "native", text=True)
    if "commit-hash: 2d8144b7880597b6e6d3dfd63a9a9efae3f533d3" not in compiler:
        raise ValueError("Rust standard-library notice revision mismatch; update vendored licenses with toolchain")
    for name in ("LICENSE-APACHE", "LICENSE-MIT", "COPYRIGHT"):
        file = Path(__file__).parent / "licenses" / ("rust-" + name)
        blocks.append(f"\n=== Rust standard library {name} ===\n" + file.read_text(encoding="utf-8"))
    sysroot = Path(subprocess.check_output(["rustc", "--print", "sysroot"], cwd=root / "native", text=True).strip())
    library = sysroot / "share" / "doc" / "rust" / "COPYRIGHT-library.html"
    blocks.append("\n=== Rust standard library complete third-party copyright inventory (HTML) ===\n" + library.read_text(encoding="utf-8"))
    extras = ["llvm-LICENSE.TXT"]
    if target.endswith("-musl"):
        extras += ["musl-COPYRIGHT", "gcc-COPYING.RUNTIME", "gcc-COPYING3"]
    for name in extras:
        blocks.append(f"\n=== Conservative native runtime notice: {name} ===\n" + (Path(__file__).parent / "licenses" / name).read_text(encoding="utf-8"))
    return "\n".join(blocks).encode("utf-8")
