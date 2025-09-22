# Node Modules Optimization for Bit BVM Distributions

## Overview

This document captures the analysis and optimization strategies for reducing Bit's node_modules size in BVM (Bit Version Manager) distributions, based on investigation conducted in September 2025.

## Current State Analysis

### Size Measurements

- **Source repository**: 1.8GB node_modules (uses .pnpm store with non-hoisted dependencies)
- **BVM installation**: 1.1GB node_modules (uses hoisted dependencies via `node-linker=hoisted`)
- **Direct pnpm install**: 1.4GB node_modules

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
- `"tslib@2": "^2.6.2"`
- `"ajv@6": "^6.12.6"`
- `"source-map@0": "0.6.1"`
- `"readable-stream@2": "2.3.8"`

**Tested savings**: 21MB reduction in fresh installations

_Note: Using version-specific keys (e.g., `postcss@8`) to handle conflicting major versions_

### 2. Cleanup Script

#### Created Files

- `scripts/cleanup-node-modules.js`: Post-install optimization script
- Updated `.circleci/config.yml`: Integrated cleanup into bundle jobs

### Features

- **Monaco Editor cleanup**: Removes `dev/`, `esm/`, `min-maps/` folders, keeps `min/` (~64MB saved)
- **Source map removal**: Configurable removal of .map files (~124MB saved)
- **Duplicate module format removal**: Removes ESM or CJS when packages ship both (~5-10MB+ saved)
- **Safety flags**:
  - `--dry-run`: Preview changes
  - `--keep-source-maps`: Keep all source maps
  - `--keep-teambit-maps`: Keep only @teambit source maps for debugging
  - `--remove-esm`: Remove duplicate ESM builds (keep CJS for current Bit)
  - `--remove-cjs`: Remove duplicate CJS builds (keep ESM for future migration)
  - `--verbose`: Detailed output

### Results

See **Results** section below for detailed measurements.

## Key Insights

### 1. Hoisting is Critical

CircleCI uses `node-linker=hoisted` which reduces size from 1.8GB to 1.1GB by avoiding duplicate packages in nested .pnpm stores.

### 2. UI Dependencies Are Problematic

Many large packages are only needed for `bit start --dev` mode:

- `date-fns` (24MB): Only used by UI date picker component
- Similar pattern likely exists with other UI dependencies

### 3. Production vs Development Split

- **`bit start`** (production): Uses pre-built bundles in artifacts, doesn't need raw UI dependencies
- **`bit start --dev`**: Rebuilds bundles via webpack, requires raw dependencies

### 4. Dependency Chain Analysis

Example chain showing transitive dependencies:

```
@teambit/design.inputs.date-picker → react-datepicker → date-fns (24MB)
```

### 5. Source Maps Distribution

- Total: 14,697 source map files (124MB)
- @teambit: 6,948 files (24MB) - useful for debugging Bit itself
- Third-party: 7,749 files (100MB) - rarely needed in production

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
  2. Applies cleanup script to bundled installation with `--keep-teambit-maps --remove-ui-deps`
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

## Testing Methodology

### Validation Process

1. Test removal of `date-fns` package manually
2. Verify `bit start` works (✅ - uses pre-built bundles)
3. Verify `bit start --dev` fails (❌ - needs raw dependencies)
4. Measure actual disk usage with `du -sm` before/after cleanup

### Key Finding

Pre-built UI bundles exist and are sufficient for normal use. Raw UI dependencies are dead weight for 95% of users who don't use `--dev` mode.

## UI Dependencies Removal Analysis

### BVM Installation Testing (September 2025)

Analysis of BVM installation at `/Users/davidfirst/.bvm/versions/1.12.122/bit-1.12.122/` (970MB after cleanup):

**UI Dependencies Identified for Removal:**

- **date-fns**: 25MB - Only used in UI date picker components
- **monaco-editor**: 12MB - Only for code editing in UI (already optimized by cleanup script)
- **react-syntax-highlighter**: 9MB - Code highlighting in UI documentation
- **react-datepicker**: 3MB - Depends on date-fns, UI-only
- **d3 packages**: 9MB total - Data visualization in UI
- **react-animate-height**: 1MB - UI animation component
- **Other React UI utilities**: ~1MB

**Total Potential Savings: ~60MB (6.2% additional reduction)**

### Validation Testing

✅ **Confirmed**: `bit start` (production mode) works without UI dependencies  
❌ **Breaks**: `bit start --dev` fails without UI dependencies (rebuilds bundles dynamically)

**Key Finding**: UI dependencies are only used in pre-built bundles located in:

- `/node_modules/@teambit/ui/artifacts/ui-bundle/`
- `/node_modules/@teambit/mdx/artifacts/`

Basic CLI commands (`bit --version`, `bit status`, etc.) function normally since they use pre-built bundles.

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
- **With PNPM overrides**: 706.3 MB (-19.1 MB additional)

### Cleanup Script Results (from 706.3 MB baseline)

| Scenario                     | Final Size | Space Saved | Reduction | Breakdown                                                   |
| ---------------------------- | ---------- | ----------- | --------- | ----------------------------------------------------------- |
| **Default mode**             | 532.2 MB   | 174.1 MB    | 24.7%     | Monaco: 62.3MB, Maps: 101MB, Locales: 10.9MB                |
| **With --keep-teambit-maps** | 558.4 MB   | 147.9 MB    | 20.9%     | Monaco: 62.3MB, Maps: 74.7MB, Locales: 10.9MB               |
| **With --remove-ui-deps**    | 524.3 MB   | 182.0 MB    | 25.8%     | Monaco: 62.3MB, Maps: 101MB, Locales: 10.9MB, UI deps: ~8MB |

**Total optimization potential**: 786.9 MB → 524.3 MB (262.6 MB saved, 33.4% reduction)

_Note: Results based on logical file size calculation using Node.js fs.statSync() rather than disk usage_

## Key Findings

### UI Dependencies Analysis

UI dependencies like `date-fns`, `react-syntax-highlighter`, and `d3-*` packages are only needed for `bit start --dev` mode. Production `bit start` uses pre-bundled UI artifacts, making these dependencies unnecessary for most users.

### Duplicate Module Formats

Many packages ship both ESM and CJS builds, effectively doubling their size:

- Example: `@modelcontextprotocol/sdk` has both `dist/esm` (4.5MB) and `dist/cjs` (4.5MB)
- Testing found 17 packages with duplicate builds, totaling ~5MB potential savings
- Since Bit currently uses CommonJS, the ESM builds can be safely removed

### Remaining Large Packages

After cleanup, the largest remaining packages are:

- `@teambit/` packages (339MB) - Core functionality, cannot be reduced
- `@pnpm/` packages (22MB) - Package manager functionality
- `@types/` packages (19MB) - TypeScript definitions
- `typescript` (18MB) - TypeScript compiler
- `@babel/` packages (18MB) - Babel transpilation tools

## Future Discussion Points

1. **Option A vs Option C**: Remove all UI deps vs selective removal
2. **Development workflow**: How to handle developers who need `--dev` mode
3. **Bundle optimization**: Further tree-shaking opportunities in UI builds
4. **Monitoring**: Track size regression in future releases
5. **Enhanced cleanup implementation**: Add UI dependency and dev-type removal flags
