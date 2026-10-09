# Dependency scanner prototype

This experiment extracts compact JS/TS dependency records using [Oxc](https://oxc.rs/docs/guide/usage/parser), pinned to 0.153.0 (Rust MSRV 1.97.0). ASTs and their arena allocations stay inside each Rust worker. It does not resolve packages, change the production detector, or claim a measured command speedup.

Build from `native/` with `cargo build --locked --release`. Run `target/release/bit-dependency-scanner [--threads N]`. The default is available CPUs capped at eight; explicit worker counts are limited to 1–64. Each input line is one JSON batch and each output line is one JSON result. Files execute in parallel; file ordering and dependency encounter ordering are retained. Requests are processed sequentially. Paths are read relative to the process working directory unless source content is supplied.

Example request:

```json
{"version":1,"id":"example","files":[{"path":"example.ts","source":"import type {Thing} from 'pkg';","kind":"ts"}],"options":{}}
```

Example response:

```json
{"version":1,"id":"example","files":[{"path":"example.ts","status":"ok","dependencies":{"pkg":{"importSpecifiers":[{"isDefault":false,"name":"Thing"}],"isTypeImport":true}},"diagnostics":[]}]}
```

`source` and `kind` are optional. Kind otherwise comes from the final path extension: js/jsx/mjs/cjs/ts/tsx/mts/cts. `id` is echoed as arbitrary JSON (null when absent). Files return `ok`, `read_error`, `parse_error`, or `unsupported`; failures return no partial dependencies. JS is parsed as a module with JSX enabled, like the legacy Babel walker; JS parse failures return `unsupported` because Babel also accepts Flow and proposal syntax that Oxc rejects. TS parse failures return `parse_error`. Malformed request schemas and unsupported protocol versions return a top-level `invalid_request` response. Parser diagnostics are strings, not stable compatibility identifiers.

Supported extraction includes import declarations, JS reexport metadata, TS type import/export flags, TS external module references, string dynamic imports, literal/raw noninterpolated template require arguments, require.resolve and import.meta.resolve. Metadata follows the installed legacy detectives, including their alias/export behavior and repeated-specifier accumulation. TS comment directives are inspected as actual parser comments. Precinct's leading no-check directive is handled before parsing for all supported languages.

JS dispatch first classifies the parsed AST in encounter order, following the installed module-definition behavior. Static import/export declarations, dynamic imports (Babel's `Import` callee), and plain require calls activate extraction. Standalone require.resolve and import.meta.resolve do not classify the file and return an empty successful result; TypeScript bypasses this JS dispatch. Early assignment expressions, member calls named require, and AMD array require calls conservatively fall back until their exact legacy shapes are implemented.

Fallback is explicit for every nonempty options object, decorators (including Angular resources), AMD define calls, import attributes/phases, namespace reexports, and other file kinds. The caller must invoke the existing detector on `unsupported`; there is no automatic production adapter yet. TypeScript numeric/boolean require arguments also request fallback to retain the legacy coercion behavior. Exotic parser acceptance differences and comments around member accesses remain compatibility areas to audit before integration. Input limits are fixed at 8 MiB per NDJSON line (excluding its newline), 4096 files per batch, and 1 MiB per inline or disk source. The transport drains oversized lines without retaining their bytes, returns top-level `invalid_request`, and continues with the next line; invalid UTF-8 requests also return `invalid_request`. Oversized batches return `invalid_request` before scanning. Oversized files return `unsupported` with no partial dependencies so callers can use legacy fallback. Disk reads stop after 1 MiB plus one sentinel byte, avoiding metadata race assumptions. Invalid UTF-8 source files request `unsupported` fallback because Node replaces invalid bytes when decoding UTF-8, while Rust requires valid UTF-8. Genuine filesystem failures remain `read_error`. Input/output I/O failures terminate the helper; malformed JSON errors do not terminate it. EOF processes a final unterminated request.

These are input-byte and concurrency limits, not a small RSS guarantee. Path-only batches can still accumulate large dependency results across 4096 files; AST expansion, responses, JSON allocations, and source-line/comment indexes are not covered by a strict response-byte or total-memory budget. A coordinator should chunk work and limit outstanding bytes before production integration. Inline source is borrowed rather than cloned.

Validation uses the shared exact pnpm formatting/lint configuration described in [pnpm-style.md](../../docs/rust/pnpm-style.md). Unit tests cover metadata, comment handling, literal calls, JSX, parse errors, and fallback. The independent differential harness under `scripts/rust-dependency-analysis/` compares against installed JavaScript detectives. Expand its fixtures and benchmark real workspaces before enabling a production path.

String-named import/reexport specifiers omit `name` on the wire where the installed JavaScript detector reads an absent ESTree identifier field. Optional require calls are skipped in JS but retained in TS, reflecting the differing legacy AST shapes. Computed `import.meta[resolve]` identifier calls preserve the legacy helper behavior.
