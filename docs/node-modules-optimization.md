# Node Modules Optimization for Bit BVM Distributions

## Overview

This document captures the analysis and optimization strategies for reducing Bit's node_modules size in BVM (Bit Version Manager) distributions, based on investigation conducted in September 2025.

## Current State Analysis

### Major Space Consumers

1. **Monaco Editor**: 77MB total

   - `dev/` folder: 34MB
   - `esm/` folder: 20MB
   - `min-maps/` folder: 11MB
   - `min/` folder: 11MB (production-ready, minified)

2. **Source Maps**: 124MB total (14,697 files)

   - @teambit source maps: 24MB (6,948 files)
   - Third-party source maps: 100MB (7,749 files)

3. **date-fns**: 24MB total

   - Locale files: 14MB (unused in most cases)
   - Function files: 10MB

4. **@teambit packages**: 339MB (core functionality)

## Implemented Solutions

### 1. PNPM Overrides for Duplicate Packages

Added overrides to consolidate duplicate packages:

- `"postcss@8": "^8.4.19"`
- `"ajv@6": "^6.12.6"`

**Tested savings**: 16.9MB reduction in fresh installations

_Note: Using version-specific keys (e.g., `postcss@8`) to handle conflicting major versions_

### 2. Cleanup Script

#### Created Files

- `scripts/cleanup-node-modules.js`: Post-install optimization script
- Updated `.circleci/config.yml`: Integrated cleanup into bundle jobs

### Features

- **Monaco Editor cleanup**: Removes `dev/`, `esm/`, `min-maps/` folders, keeps `min/` (~64MB saved)
- **Source map removal**: Configurable removal of .map files (~124MB saved)
- **Duplicate module format removal**: Removes ESM or CJS when packages ship both (~15.7MB saved)
- **Source directory removal**: Removes redundant source directories when compiled versions exist (~10.7MB saved)
- **TypeScript definitions cleanup**: Automatically removes `node_modules/@types` directory (~17MB saved)
- **Safety flags**:
  - `--dry-run`: Preview changes
  - `--keep-source-maps`: Keep all source maps
  - `--keep-teambit-maps`: Keep only @teambit source maps for debugging
  - `--remove-esm`: Remove duplicate ESM builds (keep CJS for current Bit)
  - `--remove-cjs`: Remove duplicate CJS builds (keep ESM for future migration)
  - `--remove-source`: Remove source directories when compiled versions exist
  - `--verbose`: Detailed output

### Results

See **Results** section below for detailed measurements.

## Key Insights

- **Hoisting critical**: `node-linker=hoisted` reduces size from ~1.2GB to ~800MB by avoiding nested .pnpm duplicates
- **UI dependencies**: Large packages like `date-fns` (24MB) only needed for `bit start --dev`, not production
- **Production vs Dev**: `bit start` uses pre-built bundles; `bit start --dev` rebuilds via webpack
- **Source maps**: 124MB total (24MB @teambit, 100MB third-party) - removable for production

## CircleCI Integration

### Bundle Jobs Modified

- `bundle_version_linux` (x64 and arm64)
- `bundle_version_macos` (x64 and arm64)
- `bundle_version_windows` (x64)

### Reusable Command

Created `optimize_node_modules` command with optional platform parameter for DRY code.

### Testing Integration: Bundle Simulation Jobs

**Setup Job**: `setup_bundle_simulation` (runs once)

- **Purpose**: Creates cleaned bit bundle and persists to workspace
- **Process**:
  1. Simulates bundle process (`pnpm add @teambit/bit` with hoisting + overrides)
  2. Applies cleanup script to bundled installation.
  3. Verifies cleaned installation works
  4. Persists bundle to workspace for parallel testing
- **Testing**: Uses most aggressive optimization to ensure CLI functionality isn't broken

**Test Job**: `e2e_test_bundle_simulation` (parallelized 25x)

- **Purpose**: Runs e2e tests using cleaned bit bundle from workspace
- **Process**:
  1. Attaches workspace with cleaned bundle
  2. Creates `bit-cleaned` binary link (avoids conflicts with repo binary)
  3. Runs full e2e test suite using cleaned installation
- **Output**: Separate test results (`e2e-test-results-cleaned.xml`)

**Triggers**: Both jobs only run on branches matching patterns:

- `optimize-node-modules*`
- `cleanup-script*`
- `*cleanup*script*`

This approach optimizes CI by doing expensive setup once while maintaining full parallel test coverage. Ensures cleanup script changes are thoroughly tested before production deployment without affecting regular CI runs.

## Testing & Validation

- **UI dependency removal**: Verified `bit start` works without UI deps (uses pre-built bundles)
- **Dev mode**: `bit start --dev` requires UI deps (rebuilds bundles dynamically)
- **CLI commands**: All basic commands (`bit status`, `bit compile`, etc.) work after cleanup
- **E2E tests**: Parallel test jobs validate cleaned installations thoroughly

### @types Directory Analysis

**@types Directory Removal (Safe - 17MB saved)**

The `node_modules/@types` directory can be safely removed from BVM installations because:

1. **Workspace-local installation**: When users create TypeScript components, workspaces install their own @types locally as needed
2. **CLI operations don't require types**: Basic Bit CLI commands (status, compile, etc.) don't need global TypeScript definitions
3. **Build-time vs runtime**: @types are development dependencies used during compilation, not runtime execution

**Cleanup Implementation**: The `cleanupTypeDefinitions()` function automatically removes the entire @types directory without requiring a flag, as this optimization is safer than UI dependency removal and has minimal impact on functionality.

## Esbuild Bundle Analysis Approach (Attempted)

### Investigation (September 2025)

Attempted to use esbuild bundling (PR #7180) to generate a definitive list of required files via metafile analysis.

**Results:**

- Bundle generated 47.46MB with 789 packages
- Successfully excluded some UI dependencies (monaco-editor, zod)
- **Limitations discovered:**
  - Bundle doesn't capture runtime dynamic imports
  - Lazy-loaded aspects not included in static analysis
  - Complex ESM import resolution issues
  - Time-intensive to maintain and update

**Conclusion:** While esbuild provides tree-shaking insights, it doesn't represent the full runtime requirements for a production CLI tool. The approach was abandoned in favor of targeted package analysis.

## Future Optimization Opportunities

### Option A: Remove UI Dependencies from BVM

- **Approach**: Strip UI dependencies from BVM releases entirely
- **Impact**: Save 50-100MB+ (date-fns + react-datepicker + other UI deps)
- **Trade-off**: `bit start --dev` unavailable in BVM installs
- **Target**: 1% of users who use `--dev` mode

### Option B: Development vs Production Builds

- **BVM releases**: Optimized for production (no UI deps)
- **Source installs**: Full dependencies for development
- **Benefit**: Clear separation of concerns

### Option C: Selective UI Dependency Removal

- Remove specific heavy packages like `date-fns` from BVM
- Keep lighter UI dependencies
- Hybrid approach with some functionality loss in dev mode

## date-fns Specific Analysis

### Structure

- Total size: 24MB
- Locale files: 14MB (mostly unused)
- Function files: 10MB
- Used functions: ~20 specific functions (addDays, addHours, etc.)

### Potential Optimizations

1. **Locale removal**: Remove all locales except English (-14MB)
2. **Tree shaking**: Bundle only used functions in UI builds
3. **Complete removal**: From BVM since UI is pre-bundled

## Architecture Insights

### UI Bundling Process

1. During `bit ci merge` or tag: UI components bundled via webpack
2. Bundles stored in artifacts directory (likely in @teambit/ui package)
3. `bit start`: Serves pre-built bundles
4. `bit start --dev`: Rebuilds bundles dynamically

### Global CLI Context

- Bit installed globally via BVM, not as workspace dependency
- Can't install dependencies to user workspace
- Can't modify global installation on-the-fly
- Dependencies must be present at install time

## Recommendations

### Immediate (Implemented)

1. ✅ Use cleanup script with `--keep-teambit-maps` for BVM releases
2. ✅ Integrate into CI/CD pipeline for all platforms

### Short-term

1. Investigate removing `date-fns` and other UI-only dependencies from BVM
2. Document `--dev` mode limitations for BVM users
3. Consider shipping development-focused installation instructions

### Long-term

1. Explore shipping minimal UI dependencies or pre-bundled alternatives
2. Consider two-tier distribution strategy (minimal vs full)
3. Optimize other large packages following similar patterns

## Technical Details

### Buffer Overflow Fix

Original approach using `execSync` with `find` command failed due to ENOBUFS error when scanning 14,697+ files. Fixed by implementing recursive filesystem traversal.

### Size Calculation Method

**Updated (September 2025):** Changed from `du` command to Node.js `fs.statSync()` for size calculations:

- **Previous**: Used `du -sk` (macOS) / `du -sb` (Linux) - reported disk usage (allocated blocks)
- **Current**: Uses `fs.statSync().size` - reports logical file size (actual bytes)
- **Benefits**:
  - Consistent cross-platform results
  - Matches "Size" in Finder/Explorer (not "Size on disk")
  - More accurate representation of actual data
  - Example: BVM installation shows 566MB logical size vs 880MB disk usage

### Platform Considerations

- Size calculation now uniform across all platforms using Node.js fs
- Cross-platform file deletion with proper error handling

### Safety Measures

- Only removes definitively unnecessary files
- Preserves all functionality for normal CLI operations
- Maintains debugging capabilities with `--keep-teambit-maps`
- Extensive testing on real BVM installations

## Results

Based on macOS testing (September 2025):

### Version History

- **v1.12.126 baseline**: 786.9 MB
- **v1.12.128** (removed Prompt/Winston): 725.4 MB (-61.5 MB)
- **v1.12.134** (removed memoizee): 722.8 MB (-2.6 MB)
- **v1.12.152** (updated eslint-linter, removed duplicate TypeScript): 711.3 MB (-11.5 MB)
- **With PNPM overrides**: 694.4 MB (-16.9 MB additional)

### Cleanup Script Results (from 694.4 MB baseline)

| Scenario                     | Final Size | Space Saved | Reduction | Breakdown                                                                         |
| ---------------------------- | ---------- | ----------- | --------- | --------------------------------------------------------------------------------- |
| **Default mode**             | 507.8 MB   | 186.6 MB    | 26.9%     | Monaco: 62.3MB, Maps: 101MB, @types: 17MB, Locales: 14.6MB                        |
| **With --keep-teambit-maps** | 534.1 MB   | 160.3 MB    | 23.1%     | Monaco: 62.3MB, Maps: 74.7MB, @types: 17MB, Locales: 14.6MB                       |
| **With --remove-esm**        | 483.9 MB   | 210.5 MB    | 30.3%     | Monaco: 62.3MB, Maps: 101MB, @types: 17MB, Locales: 14.6MB, Duplicate ESM: 15.7MB |
| **With --remove-source**     | 488.9 MB   | 205.5 MB    | 29.6%     | Monaco: 62.3MB, Maps: 101MB, @types: 17MB, Locales: 14.6MB, Source: 10.7MB        |
| **With --remove-ui-deps**    | 491.7 MB   | 202.7 MB    | 29.2%     | Monaco: 62.3MB, Maps: 101MB, @types: 17MB, Locales: 14.6MB, UI: ~8MB              |

**Total optimization potential**: 786.9 MB → 465.3 MB (321.6 MB saved, 40.9% reduction) with all flags

_Note: Results based on logical file size calculation using Node.js fs.statSync() rather than disk usage_

## Key Findings

### Duplicate Module Formats (~15.7MB)

- **Directory-based** (~7.6MB): Packages ship both `esm/` and `cjs/` folders (e.g., `@modelcontextprotocol/sdk`, `@sinclair/typebox`)
- **File-based** (~8.1MB): Packages ship both `.mjs` and `.mjs` files (e.g., Prettier plugins)
- Safe to remove ESM since Bit uses CommonJS

### Source Directories (~10.7MB with --remove-source)

- Packages ship both source and compiled builds (e.g., `zod/src/` + `v3/`, `moment/src/` + `min/`)
- Script removes `src/` when compiled versions exist

### UI Dependencies (~8MB with --remove-ui-deps)

- Packages like `date-fns`, `react-syntax-highlighter`, `d3-*` only needed for `bit start --dev`
- Production uses pre-bundled UI artifacts
