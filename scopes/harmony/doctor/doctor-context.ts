/**
 * Doctor Context
 *
 * This module provides a context mechanism for sharing scope information between
 * the doctor runtime and individual diagnosis implementations.
 *
 * ## Purpose
 * When running doctor against a remote scope (using `bit doctor --remote <name>`),
 * individual diagnoses need access to that remote scope object. However, the base
 * Diagnosis class doesn't pass the scope as a parameter to `_runExamine()`.
 *
 * ## How it works
 * 1. Before running diagnoses, `setRemoteScope()` is called with the remote scope
 * 2. Individual diagnoses call `getRemoteScope()` to access the remote scope
 * 3. After diagnoses complete, `setRemoteScope(undefined)` clears the context
 *
 * ## Usage Example
 * ```typescript
 * // In doctor runtime or run-doctor-on-scope.ts:
 * setRemoteScope(scope);
 * try {
 *   const result = await diagnosis.examine();
 * } finally {
 *   setRemoteScope(undefined);
 * }
 *
 * // In a diagnosis implementation:
 * async _runExamine() {
 *   const remoteScope = getRemoteScope();
 *   const scope = remoteScope || consumer?.scope || await loadScope();
 *   // ... use scope
 * }
 * ```
 */

import type { Scope } from '@teambit/legacy.scope';

/**
 * Module-level storage for the remote scope being examined.
 * This is set when running doctor against a remote scope.
 */
let remoteScope: Scope | undefined;

/**
 * Sets the remote scope context for diagnoses to access.
 * Should be called before running diagnoses and cleared (set to undefined) after.
 *
 * @param scope - The remote scope being examined, or undefined to clear the context
 */
export function setRemoteScope(scope: Scope | undefined) {
  remoteScope = scope;
}

/**
 * Gets the current remote scope context.
 * Returns undefined if not running against a remote scope.
 *
 * @returns The remote scope if set, otherwise undefined
 */
export function getRemoteScope(): Scope | undefined {
  return remoteScope;
}
