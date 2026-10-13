# Standalone object-import release artifacts

Object-import artifacts can now be built and qualified independently of a Bit installation. Explicit installation, compiled-runtime binding, packaged discovery and rollback are documented in [packaged-helper.md](./packaged-helper.md). The runtime opts in with `BIT_RUST_OBJECT_IMPORT=packaged` after assembly, or an absolute executable override. The original `rust` branch and scanner packaging are unchanged.

## Build and validate locally

Run from the repository root with the pinned Rust toolchain installed and locked dependencies fetched:

```sh
(cd native && cargo fetch --locked)
node scripts/rust-object-import/artifacts/package-helper.cjs \
  --directory "$HOME/bit-object-import-artifacts" > /tmp/bit-object-artifact-path.txt
BIT_TEST_OBJECT_ARTIFACT="$(cat /tmp/bit-object-artifact-path.txt)" \
  node --test scripts/rust-object-import/artifacts/artifacts.test.cjs
node scripts/rust-object-import/artifacts/smoke.cjs \
  "$(cat /tmp/bit-object-artifact-path.txt)"
```

An optional `--target` selects an installed target from the matrix below. The packager always executes `cargo build --locked --offline --release --package bit-object-import --target TARGET`, sets its own Cargo output directory, and packages that checkout's release output. It accepts no arbitrary prebuilt binary. Source input identity is checked before and after the build. Git revision identifies checkout HEAD, and `gitParents` records its parent SHAs: pull-request CI checks out GitHub's transient merge commit, whose parents name the base and PR head. The source digest identifies native inputs even during development with uncommitted edits. Neither a checksum nor this provenance is a publisher signature.

Each artifact consists of a deterministic `.tar.gz`, an exact SHA256 sidecar, and a detached manifest identical to the embedded manifest. New archives contain the executable, `bit-workspace.node`, `manifest.json`, `LICENSE`, and `THIRD-PARTY-NOTICES.txt`; existing archives without the addon remain supported. The addon is built separately from the same checkout and records its own size, checksum, Node-API version and build command. Rust standard-library/runtime notices reuse the scanner's existing pinned license texts. Cargo notices cover both the object-import and addon dependency closures, including build dependencies; scanner-only dependencies are excluded.

Build musl artifacts inside Alpine with the pinned Rust toolchain, GCC, Node and Git installed. The addon uses dynamic musl linking and Alpine's compiler runtime; Ubuntu's `musl-gcc` wrapper lacks the matching `libgcc_s` needed by the addon. CI builds in `rust:1.97.0-alpine` and then checks the archive in separate Node Alpine containers.

Generated archives, manifests, reports and extracted helpers belong outside the source checkout. Output directories that resolve into the source repository are rejected, including redirects through symlinks. CI uploads archives as temporary Actions artifacts with 14-day retention; they are not committed or published as release assets.

## Platform qualification

| Target                      | Qualification                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `x86_64-unknown-linux-gnu`  | Linux release build and native protocol smoke                                                     |
| `aarch64-unknown-linux-gnu` | ARM64 Linux release build and native protocol smoke                                               |
| `x86_64-apple-darwin`       | Intel macOS release build and native protocol smoke                                               |
| `aarch64-apple-darwin`      | ARM64 macOS release build and native protocol smoke                                               |
| `x86_64-pc-windows-msvc`    | Windows release build and native protocol smoke; existing runtime eligibility restrictions remain |
| `x86_64-unknown-linux-musl` | Built in Alpine and executed inside Alpine on Node 22.13, 22.22 and 24                            |

Each native artifact is tested on Node 22.13, 22.22 and 24. These CI jobs qualify executable packaging and the protocol, not every platform's complete import-command behavior. GNU artifacts record the maximum GLIBC requirement found in the binary's version names (including the GLIBC 2.36 requirement of `GLIBC_ABI_DT_RELR`). Validation checks that manifest requirement against the binary; smoke rejects hosts with an older GLIBC or different OS/architecture/ABI. ELF, Mach-O and PE architecture checks prevent target relabeling. A build on a newer Linux host can require newer GLIBC; packaging does not lower that requirement.

## Validation and remaining work

The archive reader accepts only flat regular USTAR members. It rejects duplicates, links, prefixes, traversal names, extra members, corrupt checksums, truncated members, missing terminators, trailing payload, compressed files over 64 MiB and expanded files over 80 MiB. Binary and notices limits are 64 MiB and 4 MiB; manifests are limited to 64 KiB. Archive and manifest sidecars must be bounded regular files and match exactly.

Tests cover deterministic byte preservation, malicious archives, decompression bounds, source/target/build contracts, executable architecture/ABI, changed sidecars, dependency closure, portable source identity, output restrictions, and the actual release helper. The real smoke uses a Unicode path, validates and commits a Source, checks native existence and verifies exact persisted compressed bytes.

Local validation passes all 12 artifact tests (including the real release executable), all 72 existing Node coordinator/repository tests, canonical isolated `npm run lint`, and inherited pnpm Rust formatting/Clippy/perfectionist checks with all 40 Rust workspace tests. The extracted release executable also passes the genuine 16,384-Source scope read/inventory qualification and complete compiled file/original HTTP-tar import-command smoke, including missing/crashing helper fallback. This reuses the existing compiled runtime because packaging does not change runtime sources. Other OS/ABI results require CI. Raw evidence remains outside Git.

Explicit assembly, immutable installation, compiled-runtime identity binding, adjacent-only discovery and rollback are implemented in [packaged-helper.md](./packaged-helper.md). Automatic release-pipeline assembly and broader full-command platform qualification remain open. These artifacts do not change the default runtime behavior or establish whole-command performance gains.
