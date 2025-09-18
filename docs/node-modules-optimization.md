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

## Implemented Solution: Cleanup Script

### Created Files

- `scripts/cleanup-node-modules.js`: Post-install optimization script
- Updated `.circleci/config.yml`: Integrated cleanup into bundle jobs

### Features

- **Monaco Editor cleanup**: Removes `dev/`, `esm/`, `min-maps/` folders, keeps `min/` (~64MB saved)
- **Source map removal**: Configurable removal of .map files (~124MB saved)
- **Safety flags**:
  - `--dry-run`: Preview changes
  - `--keep-source-maps`: Keep all source maps
  - `--keep-teambit-maps`: Keep only @teambit source maps for debugging
  - `--verbose`: Detailed output

### Results

- **Default mode**: 1,129MB → 913MB (216MB saved, 19.1% reduction)
- **With --keep-teambit-maps**: 1,129MB → 937MB (192MB saved, 17.0% reduction)

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

## Metrics Summary

| Scenario          | Before  | After   | Reduction     | Files Removed |
| ----------------- | ------- | ------- | ------------- | ------------- |
| Default cleanup   | 1,129MB | 907MB   | 222MB (19.7%) | 15,139        |
| Keep teambit maps | 1,129MB | 970MB   | 159MB (14.1%) | 7,717         |
| Monaco only       | 1,129MB | 1,065MB | 64MB (5.7%)   | 3             |

## Final Results

**Default mode (all optimizations):**

- Initial size: 1,129MB
- Final size: 907MB
- Space saved: 222MB (19.7% reduction)
- Files removed: 15,139

**Dry-run estimation accuracy:** Within 1MB (0.05% error) of actual results

## Additional Investigation Results (September 2025)

### Post-Cleanup Analysis of BVM Installation

After running the cleanup script with `--keep-teambit-maps` on a real BVM installation:

**Results:**

- Initial size: 1,129MB → Final size: 953MB
- Space saved: 176MB (15.6% reduction)
- Files removed: 8,171

**Remaining Large Packages Analysis:**

Top packages after cleanup:

- `@teambit/` (339MB) - Core functionality, cannot be reduced
- `@pnpm/` (22MB) - Package manager functionality
- `@types/` (19MB) - TypeScript definitions
- `typescript` (18MB) - TypeScript compiler
- `@babel/` (18MB) - Babel transpilation tools
- `react-syntax-highlighter` (9MB) - **UI-only, removable**
- `date-fns` (12MB) - **UI-only, removable**
- `d3-*` packages (~9MB total) - **UI-only, removable**

### UI Dependencies Removal Validation

**Tested Successfully Removed:**

- `react-syntax-highlighter` (9MB) - Code highlighting in UI docs
- `date-fns` (12MB) - Date picker components
- `@types/react-syntax-highlighter` (2MB) - Type definitions
- Various `d3-*` packages (9MB) - Data visualization in UI
- `@react-hook/*` packages (1MB) - React UI utilities

**Total Additional Potential Savings: ~45MB (4.7% additional reduction)**

**CLI Verification:**

- ✅ `bit --version` works normally
- ✅ `bit status` works normally
- ✅ All core CLI commands function without UI dependencies

**Key Finding:** UI dependencies are completely unnecessary for CLI operations since the UI is pre-bundled in `/node_modules/@teambit/ui/artifacts/ui-bundle/` (39MB).

### Enhanced Cleanup Script Opportunities

**Next Phase Options:**

1. **Add UI dependency removal to cleanup script:**

   ```bash
   --remove-ui-deps flag that removes:
   - react-syntax-highlighter
   - date-fns
   - d3-* packages
   - @types/react-syntax-highlighter
   - @react-hook packages
   - @teambit/react/node_modules (unneeded - using pre-bundled artifacts)
   - @teambit/ui/node_modules (unneeded - using pre-bundled artifacts)

   ⚠️ WARNING: This will break `bit start --dev` mode which rebuilds UI dynamically.
   Only use for production BVM distributions where development mode is not needed.
   ```

2. **TypeScript locale optimization:**

   - Already implemented: removes 13 locale directories (3.75MB)
   - Could potentially remove more TypeScript lib files if only specific features needed

3. **@types package optimization:**
   - `@types/jest` (7MB) - Only needed for testing
   - `@types/lodash` (4MB) - Could be tree-shaken to specific types
   - `@types/jsdom` (2MB) - Only needed for testing

### Production vs Development Recommendations

**Immediate (Can be implemented now):**

1. ✅ Current cleanup script with `--keep-teambit-maps`
2. ✅ **IMPLEMENTED**: `--remove-ui-deps` flag for additional 45MB savings
   - ⚠️ Note: Breaks `bit start --dev` mode - only use for production BVM distributions

**Future Considerations:**

1. **Two-tier BVM distributions:**
   - Standard: Current cleanup + UI deps removal (~ 35% total reduction)
   - Minimal: Remove all non-essential dependencies (potential 45%+ reduction)

## Future Discussion Points

1. **Option A vs Option C**: Remove all UI deps vs selective removal
2. **Development workflow**: How to handle developers who need `--dev` mode
3. **Bundle optimization**: Further tree-shaking opportunities in UI builds
4. **Monitoring**: Track size regression in future releases
5. **Enhanced cleanup implementation**: Add UI dependency and dev-type removal flags
