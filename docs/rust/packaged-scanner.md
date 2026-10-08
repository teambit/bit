# Explicit packaged scanner installation and rollback

Default dependency extraction remains legacy. `BIT_RUST_DEPENDENCY_SCANNER=packaged` explicitly selects a validated helper beside the installed dependency runtime. An existing absolute executable override retains precedence because it is the same environment variable; `BIT_RUST_DEPENDENCY_SCANNER=off` explicitly disables both modes. Unsetting the variable also restores legacy. No PATH, home directory, project configuration, workspace directory or network download is searched.

Discovery resolves only `__dirname/packaged/current.json`. The selector names exact scanner version `0.1.0`, target and a full revision. Immutable artifacts live under `packaged/<version>/<target>/<revision>/`. The trusted installer also emits adjacent `packaged-build.json`, binding the actually assembled runtime module hashes to exact approved artifact version/target/revision, manifest hash, binary hash and normalized Rust source/lockfile/toolchain fingerprint. An older same-version helper from another source tree cannot satisfy that binding. Default packaging always runs locked, offline release compilation for the explicit host/requested target with its output pinned inside the checkout. Installation, rollback, assembly and runtime discovery require that exact target build command in the manifest; supplied `--binary` artifacts remain unattested and cannot activate packaged mode. This prevents an old release executable from being relabeled with a newer source identity. Discovery validates artifact format **2**, protocol **1**, scanner name/version, revision, host OS/architecture, binary filename/size/SHA-256, repository license and third-party notices checksums. Regular files and confinement are enforced; package-manager symlinks to the installed runtime are supported, but redirects inside its packaged subtree are rejected. GNU discovery checks the manifest's actual GLIBC symbol requirement against Node's runtime report; unsupported hosts fall back before launch. The existing session validates real protocol responses and handles unavailable executables. All failures retain the observable `DEBUG=precinct` fallback diagnostics.

Validated binary/license content is cached only while its manifest and file device/inode/size/mtime/ctime fingerprints remain unchanged. Selector changes are read on every resolution. This avoids hashing the complete executable for each component while recognizing installation/rollback/corruption changes. Checksums detect mismatches; they do not authenticate a publisher. Installation assumes an archive obtained through the trusted release/build channel and an installation directory controlled by the Bit installer.

## Assemble into the actual Bit distribution

After compiling Bit, the distribution assembler finds compiled `rust-scanner/discovery.js` and `session.js` directories inside the assembled distribution. It rejects modules escaping that tree, validates the archive before writing, and installs the artifact beside every physical runtime copy. The distribution tar retains binaries, manifest and notices. The existing CircleCI `compress_bit` command invokes this assembler only when `BIT_RUST_SCANNER_ARTIFACT_DIRECTORY` is explicitly supplied. That directory must contain exactly one archive for each requested Bit distribution target. Each of the five tar jobs passes its target explicitly. The directory is not downloaded automatically and release publication is unchanged.

```sh
python3 scripts/rust-dependency-analysis/artifacts/install-helper.py assemble \
  --distribution /absolute/path/to/bit-2.2.93 \
  --archive /trusted/artifacts/bit-dependency-scanner-0.1.0-x86_64-unknown-linux-gnu-REVISION.tar.gz \
  --target x86_64-unknown-linux-gnu
BIT_RUST_DEPENDENCY_SCANNER=packaged /path/to/assembled/bit --version
```

`--version` confirms the Bit installation; commands that analyze dependencies launch the selected helper. The real archive test assembles a distribution, relocates it into a path containing spaces and Unicode, discovers the relocated helper and performs actual extraction through the production session.

For a single existing runtime, install with a same-host smoke test before activation:

```sh
python3 scripts/rust-dependency-analysis/artifacts/install-helper.py install \
  --module-directory /installed/@teambit/dependencies/dist/files-dependency-builder/rust-scanner \
  --archive /trusted/scanner.tar.gz
python3 scripts/rust-dependency-analysis/artifacts/install-helper.py rollback \
  --module-directory /installed/@teambit/dependencies/dist/files-dependency-builder/rust-scanner
```

All archives require their detached manifest and SHA-256 sidecars. Installation verifies bounded flat regular members, executable architecture/format and binary/license hashes; stages files in the destination filesystem; atomically renames a completed immutable revision; then atomically replaces the selection file. A different binary for the same version/target/revision is rejected. The previous selector is retained when activation changes. The bounded build descriptor retains at most 32 exact artifact tuples with the same scanner source identity. Different source identities require a matching complete Bit/runtime build; `off` is the immediate rollback when reverting the complete build is unavailable. Rollback validates previous manifest, binary and licenses before switching; it does not delete installed revisions. Failed validation leaves the active selector unchanged. Run installation/rollback serially per runtime. Cross-target distribution assembly validates without executing that target's helper; each target's CI separately performs real installation/execution.

## Platform and Node policy

The matrix follows `.circleci/config.yml` tar uploads and the Alpine Docker distribution, plus `package.json`'s Node engine `>=22.13.0`. CI uses minimum Node 22.13.0, repository Node 22.22.0 and Node 24 for real packaged installation. This is a configured matrix; successful workflow results must be checked before claiming these new targets validated.

| Bit distribution | Scanner target              | Validation                                                               |
| ---------------- | --------------------------- | ------------------------------------------------------------------------ |
| Linux x64 GNU    | `x86_64-unknown-linux-gnu`  | Ubuntu native Rust tests and real packaged discovery                     |
| Linux ARM64 GNU  | `aarch64-unknown-linux-gnu` | Ubuntu ARM64 native Rust tests and real packaged discovery               |
| macOS x64        | `x86_64-apple-darwin`       | Explicit Intel macOS runner                                              |
| macOS ARM64      | `aarch64-apple-darwin`      | Explicit ARM macOS runner                                                |
| Windows x64      | `x86_64-pc-windows-msvc`    | Windows native Rust tests and real packaged discovery                    |
| Alpine x64       | `x86_64-unknown-linux-musl` | Cross-built release, installed/executed in actual Alpine Node containers |

Runner labels come from [GitHub's official runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). GNU minimum GLIBC is derived from the binary, not a runner label: the local supplied release required **2.39**, so older GNU hosts explicitly use legacy even when their Node version satisfies Bit's engine. This change does not broaden Bit's OS minimums or enable a native default. Windows ARM, ARM musl and other targets fall back. Additional Node major versions permitted by the engine are not claimed tested by this matrix.

## Redistribution notices and reproducibility

Artifact format 2 adds mandatory `THIRD-PARTY-NOTICES.txt`; format 1 archives are intentionally rejected by the new installer. Packaging reads locked offline Cargo metadata, conservatively includes every locked registry dependency (including build tools), exact SPDX declarations, repositories, license/notice text and hashes, and fails if license text is missing. Published OXC sources omit root licenses, so exact source-commit licenses for OXC and oxc-index are vendored with recorded official URLs/SHA-256 in `artifacts/licenses/sources.json`; unexpected revisions fail packaging.

The pinned Rust 1.97.0 commit's MIT/Apache/COPYRIGHT text and its installed standard-library `COPYRIGHT-library.html` inventory are included, along with conservative LLVM notices. Musl artifacts add musl and GCC runtime exception/license notices matching the pinned Rust toolchain's musl build inputs. [Rust's pinned musl build script](https://github.com/rust-lang/rust/blob/2d8144b7880597b6e6d3dfd63a9a9efae3f533d3/src/ci/docker/scripts/musl-toolchain.sh) identifies these inputs. A changed Rust commit requires explicit notice updates. Vendored notice hashes are checked before packaging. GNU system shared libraries and Apple/Windows system libraries are not bundled by the archive.

Sorted members, fixed tar metadata and deterministic gzip remain enforced. Identical binary/manifest/notice inputs produce identical archives; this does not claim independently reproducible compiler output. Runtime notices are distributed with each installed immutable revision and remain available after relocation and rollback.

Local validation covers real packaged install/discovery/session parsing and errors, absent/corrupt/wrong-version/target/protocol/format fallback, explicit off/absolute override, GLIBC rejection, symlink redirects, relocation, immutable installation, failed activation and rollback. Existing real dependency pipeline/scope regressions and strict standalone TypeScript checks pass. Cross-platform results depend on the new CI matrix, not this Linux smoke run.

Windows helper executable paths use [Node’s namespace-prefixed representation](https://nodejs.org/docs/latest-v22.x/api/path.html#pathtonamespacedpathpath) after validation, so deeply installed artifacts can be launched without the ordinary Windows path-length representation.
