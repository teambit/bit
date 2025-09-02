# Node.js v24 ESM Compatibility Fixes for Bit

## Summary
This document describes the systematic fixes applied to make the Bit codebase compatible with Node.js v24's stricter ESM (ECMAScript Modules) handling. The main issue was that Node.js v24 has stricter CommonJS/ESM interoperability rules compared to v22, requiring explicit configuration for modules to work correctly.

## Problem Statement
When running e2e tests with Node.js v24.4.1, the tests failed with various ESM-related errors:
- Named exports not found from CommonJS modules
- `require` is not defined in ES module scope
- Missing imports for chai plugins

## Root Cause
Node.js v24 enforces stricter ESM/CommonJS interop rules:
1. CommonJS modules with lazy-loaded exports (using getters) cannot be reliably imported as named exports in ESM contexts
2. The `require()` function is not available in ESM module scope
3. Package.json files need explicit `exports` field configuration for proper ESM resolution

## Solutions Implemented

### 1. Created ESM Wrapper Files (esm.mjs)
Created or updated esm.mjs files for the following modules to explicitly re-export named exports:

#### New esm.mjs files created:
- `/components/legacy/bit-map/esm.mjs` - Exports including `MissingMainFile`
- `/components/legacy/scope/esm.mjs` - Exports including `ScopeNotFound`
- `/components/component-issues/esm.mjs` - Exports including `IssuesClasses`
- `/components/legacy/consumer/esm.mjs` - Exports including `ConsumerNotFound`

#### Updated existing esm.mjs files:
- `/scopes/component/tracker/esm.mjs` - Added `MainFileIsDir` export
- `/scopes/harmony/doctor/esm.mjs` - Added `DiagnosisNotFound` and `DIAGNOSIS_NAME_VALIDATE_GIT_EXEC`
- `/scopes/harmony/host-initializer/esm.mjs` - Added `ObjectsWithoutConsumer`
- `/scopes/component/snapping/esm.mjs` - Added multiple exports including `AUTO_TAGGED_MSG`

### 2. Updated Package.json Files
Added `exports` field to package.json files to properly configure ESM/CommonJS dual package support:

```json
"exports": {
  ".": {
    "require": "./dist/index.js",
    "import": "./dist/esm.mjs",
    "types": "./index.ts"
  }
}
```

This was done by updating the environment configuration to automatically add this field to all relevant component package.json files.

### 3. Converted require() to ESM imports
Fixed 122+ files by converting CommonJS `require()` statements to ESM imports:

#### chai-fs conversions:
- From: `chai.use(require('chai-fs'))`
- To: `import chaiFs from 'chai-fs';` + `chai.use(chaiFs);`

#### chai-arrays conversions:
- From: `const assertArrays = require('chai-arrays')`
- To: `import assertArrays from 'chai-arrays';`

#### chai-string conversions:
- From: `chai.use(require('chai-string'))`
- To: `import chaiString from 'chai-string';` + `chai.use(chaiString);`

### 4. Fixed Missing Imports
Identified and fixed files that were using chai plugins without importing them:
- `/e2e/harmony/custom-aspects.e2e.ts`
- `/e2e/harmony/install-and-compile.e2e.ts`
- `/e2e/harmony/mocha-tester.e2e.ts`
- `/e2e/harmony/root-components.e2e.ts`
- `/e2e/functionalities/repository-hooks-aspects.e2e.ts`

## Files Modified Summary
- **ESM wrapper files**: 8 created/updated
- **E2E test files**: 122+ files updated with proper ESM imports
- **Package.json configuration**: Updated via environment configuration

## Testing Status
After applying these fixes, the e2e tests started running successfully with Node.js v24. The tests were able to:
- Import named exports from CommonJS modules
- Use chai plugins with proper ESM imports
- Resolve modules correctly with the new `exports` field configuration

## Remaining Work
While the major ESM compatibility issues have been resolved, there may be additional files that need similar fixes. The pattern for fixing any remaining issues is now established:

1. For missing named exports: Check if the module has an esm.mjs file and proper exports field in package.json
2. For undefined variables: Add the missing import statement
3. For require() errors: Convert to ESM import syntax

## Key Learnings
1. Node.js v24 requires explicit `exports` field in package.json for proper ESM/CommonJS dual package support
2. Lazy-loaded CommonJS exports need explicit re-export in esm.mjs files
3. All require() statements in ESM contexts must be converted to import statements
4. The transition from Node.js v22 to v24 requires systematic updates to module resolution configuration

## Branch and PR
- Branch: `fix/node-v24-esm-compatibility`
- PR: https://github.com/teambit/bit/pull/9949