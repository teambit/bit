# Standalone scanner artifacts

The Rust scanner remains experimental and opt-in. This workflow validates standalone release-profile archives; it does not publish GitHub releases or npm packages or change the default detector. Explicit installation/distribution assembly and opt-in packaged discovery are described in [packaged scanner installation](packaged-scanner.md).

## Coverage and naming

Bit already consumes platform-specific `@pnpm/napi` npm packages, including GNU/musl variants, through its package manager dependencies. The scanner artifact matrix now explicitly covers the five Bit tar distribution architectures and x64 Alpine/musl. Each job packages its actual Rust host target rather than guessing architecture from a runner label.

The recognized targets are `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`, `x86_64-unknown-linux-musl`, `x86_64-pc-windows-msvc`, `aarch64-apple-darwin` and `x86_64-apple-darwin`. Windows ARM, Linux ARM musl, FreeBSD and deployment systems older than the recorded binary libc requirement remain outside this matrix. The manifest records the build environment; a successful host smoke test does not establish compatibility with older deployment systems.

Each job produces three files:

```text
bit-dependency-scanner-0.1.0-<rust-target>-<revision-prefix>.tar.gz
bit-dependency-scanner-0.1.0-<rust-target>-<revision-prefix>.tar.gz.sha256
bit-dependency-scanner-0.1.0-<rust-target>-<revision-prefix>.tar.gz.manifest.json
```

Version comes from the scanner's Cargo manifest. On pull requests, CI checks out GitHub's transient merge commit, so the revision (and the workflow artifact name) is that merge commit rather than the PR head; `gitParents` records the base and PR-head SHAs that identify the source. The revision prefix is the first twelve Git SHA characters; the manifest carries the full source-checkout SHA and its parent SHAs, protocol version `1`, artifact format `2`, target/OS/architecture/ABI, complete `rustc -vV`, Cargo.lock SHA-256, build platform, binary filename/size/SHA-256, and repository license and third-party notices checksums. GNU binaries record their highest required GLIBC symbol version, inspected by readelf. Executable headers are checked against the declared architecture/format.

The archive contains only `bit-dependency-scanner` (or `.exe`), `manifest.json`, , `LICENSE` and `THIRD-PARTY-NOTICES.txt`, in sorted flat-member order. Tar metadata has zero timestamps/UID/GID and fixed modes; gzip embeds neither a filename nor a current timestamp. Identical binary and manifest inputs produce identical archive bytes. This guarantees deterministic packaging, not independently reproducible compiler output across machines or toolchains. The checksums detect mismatches; they are not signatures or publisher authentication.

## Build and validate

Python 3.11 or newer is required for packaging, with no external Python packages. CI pins Python 3.13. The provenance explicitly distinguishes the source-checkout revision, the packaging environment's reported Rust toolchain, and an explicitly supplied versus default release binary. An arbitrary `--binary` file is not attested to have been compiled at that revision; CI establishes the match by building immediately before packaging in the same checkout. Build from the same checkout that supplies the manifest provenance:

```sh
cd native
python ../scripts/rust-dependency-analysis/artifacts/test_artifacts.py
python ../scripts/rust-dependency-analysis/artifacts/package-helper.py package
python ../scripts/rust-dependency-analysis/artifacts/package-helper.py smoke
```

Outputs go to ignored `native/dist/`. `--directory` changes that destination. `--binary` supports a separately supplied release binary; the caller must ensure it was built from the labeled checkout/target/toolchain. To validate an individual archive, pass `smoke --archive <file>` with its checksum and detached manifest beside it.

The smoke validator checks the archive checksum before decoding it, enforces compressed/expanded limits, rejects duplicate/unexpected members, links, and traversal paths, verifies the embedded binary and license checksums, and compares the detached manifest. It writes only the fixed allowed filenames into a fresh directory containing spaces and Unicode, restores the executable mode, and invokes the binary directly with an argument vector. Protocol tests cover exact request IDs, Unicode dependency extraction, type-import metadata, and parse errors; the process closes after stdin EOF. The target must match the validation host.

The five-architecture Rust test job runs these checks after building its release binary and uploads validated workflow artifacts for fourteen days. Real installation/discovery tests run on Node 22.13.0, 22.22.0 and 24, with x64 musl tested inside Alpine containers. No publication action follows. Review the matrix's actual successful target manifests before proposing broader distribution or platform support; platform limitations and installation/version-selection policy are recorded in the packaged-scanner document.

Default packaging compiles with `cargo build --locked --offline --release --workspace --target <host-or-requested-target>` and reads `native/target/<target>/release/`. Fetch/build locked dependencies first if they are absent; packaging does not fetch them. Its manifest records this exact build command, which packaged installation and runtime discovery require. Explicit `--binary` packaging stays experimental and unattested.
