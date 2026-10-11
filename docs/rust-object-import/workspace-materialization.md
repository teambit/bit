# Rust workspace file materialization

This stage starts from merged object-import PR #70, on the dedicated
`rust-workspace-materialization` base branch. `DataToPersist.persistAllToFS()` can
now use Rust to create parent directories and write actual workspace source files.
The existing deletion phase finishes first; linking starts only after all file
writes succeed. Capsule persistence keeps its existing implementation.

Enable the experimental path with both:

```sh
BIT_RUST_OBJECT_IMPORT=/absolute/path/to/bit-object-import \
BIT_RUST_WORKSPACE_MATERIALIZATION=on bit import component --override
```

An installed source-bound helper may also be selected with
`BIT_RUST_OBJECT_IMPORT=packaged`. Discovery uses the existing installed artifact
checks, never PATH or a runtime download. Trusted release provisioning accepts
successful exact-revision builds of the new base branch, alongside the existing
Rust base branches. The feature remains opt-in.

The `BWM1` protocol sends binary contents and absolute UTF-8 paths in frames of at
most 64 files and 32 MiB of contents plus paths. Rust validates the complete frame
before writing anything, creates parents once per frame, and writes in place.
Existing permissions, ownership, ACLs, hard links and symbolic-link targets are
therefore retained, matching `fs.outputFile`. New files use the process umask and
inherited directory metadata. `override=false` retains the canonical existence
check and writer for its entire chunk: an unacknowledged partial new file must not
be mistaken for an existing file during replay. Empty and binary files are supported.

Node retains Bit's exact `isbinaryfile` classification and host newline conversion
before transferring bytes. File selection, nested-component ownership, bitmap
updates and model hydration remain in their existing layers. Files with custom
write methods, including atomic `JsonVinyl` and `License`, retain those methods and
the canonical concurrency of their entire I/O chunk; native runs can resume on
later eligible chunks. Oversized or unrepresentable files also use their existing
writer.

An operation containing an eligible chunk owns a helper; fully canonical operations
launch none. Each helper uses one worker, with at most four helpers active across
operations. Frames remain within the caller's configured I/O concurrency chunks:
a failed chunk never starts files in the next chunk. The file list is snapshotted
before processing, matching the canonical pool. Rust acknowledges a completed
prefix and stops at its first filesystem error. Node reproduces the failed write
through the original method, preserving canonical error identity. Unsupported,
old, missing, crashed or malformed helpers fall back after termination and reaping;
unacknowledged writes are replayed only once the helper can no longer write. Each
frame has a 120-second deadline and termination escalates after 250 ms.

## Validation and measurements

Qualification runs the actual source and physically compiled `DataToPersist`
against the release helper. Coverage includes multiple frames, byte limits,
newline/binary parity, overwrite rules, deletion/link ordering, custom and atomic
writers, modes/inodes/links, canonical filesystem errors, concurrency failure
boundaries, file-list snapshots, old helpers, and late writes after malformed
acknowledgements. The Linux/macOS/Windows canonical graph CI jobs run both variants.
Rust protocol tests also reject incomplete and oversized frames before mutation.

Full-command comparisons use the same compiled CLI and helper in `workspace-node`
and `workspace-native` modes, changing only the materialization flag. The existing
import harness verifies all object/model/index readback, workspace bytes and bitmap
entries; installation runs additionally verify package versions and source links.
Separate diagnostic runs observe `BWM1` requests and acknowledgements, so a silent
fallback cannot count as native coverage. Warmups and diagnostics are excluded from
retained timings. CPU totals include child helpers; RSS is sampled simultaneously
across the client process tree. Fixture HTTP servers are excluded.

All 281 applicable Node tests pass (two platform-specific skips), all 20 compiled
materialization tests pass, all 69 unchanged canonical model/index specifications
pass, and all 67 Rust workspace tests pass. Canonical TypeScript/Oxlint, pinned
formatting, warning-denied Clippy/perfectionist Dylint and rustdoc pass without new
exceptions. Packaged-helper full import/install smoke checks also pass, including
native wire coverage, exact object/file readback and package/source links.

The final retained comparisons below use nine alternating rounds per mode for
checkout and installation, and three per mode for the larger workspace. The small
workspace has 16 components, two remotes, 32 files of 16 KiB and four versions. The
larger workspace has 100 components, 2,500 files of 1 KiB and two versions.
Numbers are medians, shown as Node → Rust; CPU and RSS columns describe cold runs.

| Command / filesystem        | Rounds |  Cold wall (ms) |  Warm wall (ms) |     CPU (s) | Sampled tree RSS (MiB) |
| --------------------------- | -----: | --------------: | --------------: | ----------: | ---------------------: |
| Checkout / tmpfs            |      9 |   330.7 → 325.6 |   355.9 → 302.4 | 0.43 → 0.44 |          160.5 → 160.3 |
| Checkout / Btrfs            |      9 |   406.2 → 439.9 |   388.3 → 396.2 | 0.55 → 0.60 |          160.9 → 160.6 |
| Import/install / tmpfs      |      9 | 1800.9 → 1998.4 | 1268.0 → 1524.0 | 1.89 → 1.95 |          413.0 → 482.8 |
| Import/install / Btrfs      |      9 | 1615.3 → 1729.4 | 1246.0 → 1323.6 | 1.53 → 1.66 |          418.4 → 491.3 |
| 2,500-file checkout / tmpfs |      3 |   831.8 → 856.3 |   753.7 → 756.1 | 1.13 → 1.13 |          298.3 → 301.5 |
| 2,500-file checkout / Btrfs |      3 |   932.2 → 929.8 |   804.4 → 815.9 | 1.35 → 1.25 |          299.4 → 305.0 |

Small-workspace cold checkout ranges overlap on both filesystems: tmpfs ranges
are 311.9–518.0 ms for Node and 315.4–524.2 ms for Rust; Btrfs ranges are
324.8–511.3 and 329.5–639.7 ms. Tmpfs installation also has substantial variability,
including a retained Rust outlier: ranges are 1487.6–2339.7 and 1553.3–5665.2 ms.
Btrfs installation regresses with disjoint ranges, 1576.0–1632.6 versus
1685.8–1929.2 ms. All retained observations are included. The three-round larger
workspace runs establish regression coverage, not a performance benefit. These
results support retaining the opt-in flag and do not justify default activation or
a memory-saving claim.

Diagnostics confirm all 32 checkout files reach Rust, all 2,500 larger-workspace
files reach Rust in 50 frames, and installation writes 288 files in 33 frames,
including further generated files. Every native file is acknowledged, with no
filesystem fallback in these ordinary fixtures. Fully canonical operations launch
no helper; other operations still pay their per-operation helper lifecycle cost.

All six final reports match the final helper, source modules, physical compiled
modules and harness hashes. Generated reports, binaries, private compiled graphs,
exploratory runs and logs stay outside Git in
`$HOME/bit-workspace-materialization-evidence-2026-10-11`. Earlier exploratory
results are excluded. The original `rust` checkout and user lockfile are untouched.

Reproduce against an owned physical compiled CLI and the release helper:

```sh
TMPDIR=/dev/shm \
BIT_IMPORT_QUALIFICATION_MODES=workspace-node,workspace-native \
BIT_IMPORT_QUALIFICATION_TRANSPORT=http \
BIT_IMPORT_QUALIFICATION_COMMAND=checkout \
BIT_IMPORT_QUALIFICATION_CASES=command-workspace \
BIT_IMPORT_QUALIFICATION_ROUNDS=9 \
BIT_IMPORT_QUALIFICATION_TMPDIR=/dev/shm \
BIT_IMPORT_QUALIFICATION_REPORT=/absolute/evidence/checkout.json \
node --expose-gc scripts/rust-object-import/import-qualification.cjs \
  /absolute/private-cli /absolute/bit-object-import
```

Repeat with `BIT_IMPORT_QUALIFICATION_COMMAND=install`, an external Btrfs scratch
directory, or `BIT_IMPORT_QUALIFICATION_CASES=many-small` and three rounds. Physical
CLI preparation uses `scripts/rust-object-import/prepare-cli.cjs`; it compiles the
existing object import graph plus `teambit.component/sources` and rejects external
dependency aliases. Runtime installation and smoke checks use the existing
source-bound artifact assembler.
