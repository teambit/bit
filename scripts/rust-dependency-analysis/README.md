# Rust dependency extraction compatibility harness

This standalone harness uses the installed Bit built-in JS and TypeScript detectives as the reference. It does not change production dispatch or package dependencies. Run from an installed checkout, or set `BIT_LEGACY_ROOT` to an installed Bit checkout:

```sh
node --test scripts/rust-dependency-analysis/compare.test.cjs
node scripts/rust-dependency-analysis/compare.cjs
node scripts/rust-dependency-analysis/compare.cjs /absolute/path/to/rust-engine
```

The second command prints reference results. The third sends version 1 NDJSON requests through one engine process and exits unsuccessfully on any discrepancy. Additional arguments are passed to the executable, for example `--threads 4`.

Each request has `{ version: 1, files: [{ path, source }], options: {} }`. Each response has `{ version: 1, files: [{ path, status, dependencies, diagnostics }] }`. Supported statuses are `ok`, `parse_error`, `read_error`, and `unsupported`. Dependencies are a record keyed by module specifier with optional `importSpecifiers` and `isTypeImport` matching the legacy detector. Parser-specific diagnostic wording is intentionally not compared; parse failures must still return `parse_error` rather than partial successful extraction.

The comparison checks two layers: the ordered dependency keys consumed by precinct, then the raw metadata returned by the detectives. Precinct currently normalizes built-in results to keys, so metadata parity is a separate compatibility requirement for future integration. The reference also implements precinct's leading `@bit-no-check` short circuit, `includeCore: false` filtering, and JS module classification: AMD files expect `unsupported`, and JS files that `module-definition` classifies as `none` (for example, a lone `require.resolve`) yield no dependencies. Detectives receive only their per-type options (`options.ts`, `options.es6`, `options.commonjs`), and TSX gets the same `jsx: true` parser setting as precinct.

Fixtures cover JS/JSX/CJS/MJS, TS/TSX/MTS/CTS, imports and reexports, aliases, type imports, duplicate dependencies, dynamic imports, require calls, syntax errors, comments and strings, ignore directives, Angular assets, and core filtering. AMD, custom detectors, CSS, Angular decorators, and nonempty options explicitly expect `unsupported` so callers retain the legacy path. Reference snapshot mode still records the actual legacy Angular and core-filter outputs for later parity work. The custom-detector flag is a protocol test marker, not a serialized detector implementation.

This is an extraction prototype check, not a complete replacement for precinct tests. Environment/global detector registration, resolver behavior, filesystem read failures, source locations, arbitrary parser options, and real workspace command timing need additional integration coverage. Expand fixtures as compatibility gaps are found; do not silently bless mismatches as new expected output.
