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

**Solution**: Implement backward compatibility by assigning versions to legacy core envs in memory during component load, without migrating existing snapshots. Use `teambit.envs/empty-env` as the new default environment.

## Implementation

### Empty Env Solution

The key challenge was the default env (`teambit.harmony/node`) being removed from core but still needed during initialization. The solution:

**Created `teambit.envs/empty-env`** - a minimal environment with no compiler, tester, or tools that remains in core as a lightweight aspect. This becomes the new `DEFAULT_ENV`.

Files created in `scopes/envs/empty-env/`:

- `empty-env.env.ts` - Empty env class
- `empty-env.aspect.ts` - Aspect definition
- `empty-env.main.runtime.ts` - Runtime registration
- `index.ts` - Type exports

### Backward Compatibility

**`scopes/envs/envs/environments.main.runtime.ts`** - Key changes:

```typescript
// Track all 9 legacy core envs for backward compatibility
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

// Include empty-env as a core env along with legacy envs
getCoreEnvsIds(): string[] {
  return ['teambit.envs/empty-env', ...this.getLegacyCoreEnvsIds()];
}

// Changed DEFAULT_ENV constant
export const DEFAULT_ENV = 'teambit.envs/empty-env';
```

The `resolveEnv()` method handles version assignment for legacy envs: when loading components with envs lacking versions, it searches the component's aspects for a versioned reference, falls back to envSlot, and assigns the latest available version in memory.

### Core Aspects

**`scopes/harmony/bit/manifests.ts`** - Removed all env aspects from manifestsMap except EmptyEnvAspect:

```typescript
import { EmptyEnvAspect } from '@teambit/empty-env';

export const manifestsMap = {
  // ... other aspects
  [EmptyEnvAspect.id]: EmptyEnvAspect,
};
```

## Benefits

- **Reduced binary size**: Core envs no longer bundled with Bit
- **Smaller node_modules**: Only needed envs are installed
- **Backward compatible**: Old components without env versions work via automatic version resolution
- **No breaking changes**: Version assignment happens transparently in memory
- **Minimal overhead**: Empty-env adds negligible size to core
