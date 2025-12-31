# Removing Core Environments from Bit Core

## Overview

This document describes the implementation for removing **all** core environments from Bit's core binary to reduce its size and node_modules footprint. These environments will become regular dependencies instead of bundled core aspects.

### Environments Being Removed

All of the following environments are being removed from core:

- `teambit.harmony/aspect` - Aspect environment
- `teambit.html/html` - HTML environment
- `teambit.mdx/mdx` - MDX environment
- `teambit.envs/env` - Env environment (for creating custom envs)
- `teambit.mdx/readme` - Readme environment
- `teambit.harmony/bit-custom-aspect` - Custom aspect environment
- `teambit.harmony/node` - Node.js environment
- `teambit.react/react` - React environment
- `teambit.react/react-native` - React Native environment

## Background

**Problem**: Core environments are currently bundled with Bit, increasing binary size and node_modules footprint unnecessarily.

**Challenge**: Components using core envs were saved with IDs without versions (e.g., `teambit.harmony/node`) because they were core aspects. After removal, they need versions like any other dependency.

**Solution**: Implement backward compatibility by assigning versions to legacy core envs in memory during component load, without migrating existing snapshots.

## Implementation Details

### Core Concept

- **Old components** (tagged before removal): Have env IDs stored without versions
- **New components** (tagged after removal): Will store env IDs with versions
- **Version assignment**: Happens in memory during load using latest available version
- **Snapshots**: Remain immutable - no data migration required

### Files Modified

1. **`scopes/harmony/bit/manifests.ts`**

   - Removed all core env aspects from manifestsMap:
     - AspectAspect
     - MDXAspect
     - ReadmeAspect
     - EnvAspect
     - NodeAspect (previously removed)
     - ReactAspect (previously removed)
   - Commented out imports
   - Marked as "Removed from core - now a regular env"

2. **`scopes/envs/envs/environments.main.runtime.ts`**

   **Added `getLegacyCoreEnvsIds()` method:**

   ```typescript
   private getLegacyCoreEnvsIds(): string[] {
     return [
       'teambit.harmony/aspect',
       'teambit.html/html',
       'teambit.mdx/mdx',
       'teambit.envs/env',
       'teambit.mdx/readme',
       'teambit.harmony/bit-custom-aspect',
       'teambit.harmony/node',
       'teambit.react/react',
       'teambit.react/react-native',
     ];
   }
   ```

   **Updated `getCoreEnvsIds()` method:**

   - Now returns only legacy core envs (all envs removed from core)
   - Maintains backward compatibility for old components

   **Enhanced `resolveEnv()` method:**

   - Detects legacy core envs (envs in getLegacyCoreEnvsIds list)
   - First tries to find env with version in component's aspects
   - Falls back to envSlot to find loaded env version
   - Returns ComponentID with version assigned

   **Updated `calculateEnvId()` method:**

   - For core envs (including legacy), calls `resolveEnv()` to get version
   - Ensures legacy envs without versions are properly resolved

## Version Assignment Strategy

When loading a component with a legacy core env:

1. Check if env ID is in legacy core envs list (without version)
2. Search component's aspects for this env with a version
3. If not found, check envSlot for registered env version
4. Assign the found version (latest available)
5. Return ComponentID with version

## Key Design Decisions

- **Option A chosen**: Assign latest available version (matches current behavior)
- **No migration**: Version assignment only in memory, snapshots unchanged
- **Core env treatment**: Legacy envs still treated as core for backward compat
- **Package.json**: Works automatically like any other non-core env
- **Empty env as default**: Created `teambit.envs/empty-env` as new DEFAULT_ENV to replace `teambit.harmony/node`

## Empty Env Solution

To solve the chicken-and-egg problem where the default env (Node) was removed from core but needed during early initialization:

1. **Created `teambit.envs/empty-env`**:

   - A minimal empty environment with no compiler, tester, linter, or other tools
   - Used as the default fallback when no other env is specified
   - Remains in core as a lightweight core aspect

2. **Files Created**:

   - `scopes/envs/empty-env/empty-env.bit-env.ts` - Empty env class
   - `scopes/envs/empty-env/empty-env.aspect.ts` - Aspect definition
   - `scopes/envs/empty-env/index.ts` - Exports

3. **Integration**:
   - Added `EmptyEnvAspect` to `manifests.ts`
   - Changed `DEFAULT_ENV` from `'teambit.harmony/node'` to `'teambit.envs/empty-env'`
   - Set to use `teambit.envs/env` as its own env

This approach ensures:

- No external dependencies needed for the default env
- Minimal binary size impact (just a few lines of code)
- Components without an explicit env can still be loaded
- Backward compatibility maintained

## Testing Considerations

To verify the implementation:

1. Create/load old components with legacy core env references (no version)
2. Verify they load correctly with version assigned
3. Tag/snap new components and verify env ID includes version in snapshot
4. Remove core env packages from repository
5. Add them as regular dependencies in workspace.jsonc
6. Test loading and tagging workflows

## Future Work

Once this change is deployed:

1. Remove all env packages from core repository (aspect, html, mdx, env, readme, bit-custom-aspect, node, react, react-native)
2. Publish them as separate packages
3. Update documentation to reflect they are no longer core envs
4. Most users already use non-core envs, so impact should be minimal

## Important Notes

- **HtmlAspect and bit-custom-aspect**: These were not found in manifests.ts, suggesting they may have been removed previously or exist elsewhere
- **All envs treated equally**: Whether an env has "env" in its name or not (like mdx, aspect, readme), they are all environments that provide functionality to components

## Benefits

- **Reduced binary size**: Core envs no longer bundled with Bit
- **Smaller node_modules**: Only needed envs are installed
- **Backward compatible**: Old components continue to work
- **No breaking changes**: Version assignment is transparent
- **Cleaner architecture**: Clear separation between core aspects and envs
