import type { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { prompt } from 'enquirer';
import type { Workspace } from '../workspace';

const BUILTIN_TRUSTED_PATTERNS = ['teambit.*', 'bitdev.*'];

const WORKSPACE_ASPECT_ID = 'teambit.workspace/workspace';

export type TrustedScopesGroups = {
  /** patterns built into Bit (`teambit.*`, `bitdev.*`) */
  builtin: string[];
  /** owner wildcard inferred from `defaultScope` (e.g. `acme.frontend` → `acme.*`) */
  owner: string[];
  /** patterns explicitly configured in `workspace.jsonc` under `trustedScopes` */
  configured: string[];
};

/**
 * Workspace-level scope-trust policy. Opt-in: when the `trustedScopes` key is
 * present in workspace.jsonc (even as an empty array), the aspect-load gate
 * is active. When the key is absent, no gate runs and any aspect loads.
 *
 * Once opted in, a scope is trusted if it matches any pattern in:
 * - the builtin set (`teambit.*`, `bitdev.*`),
 * - the owner wildcard derived from the workspace's `defaultScope`
 *   (e.g. `acme.frontend` → `acme.*`),
 * - the `trustedScopes` array configured in workspace.jsonc.
 *
 * Patterns are exact (`acme.frontend`) or owner wildcard (`acme.*`).
 *
 * Wired into `ScopeMain` via `setAspectLoadGuard`; the guard runs in the
 * aspect-loader path so untrusted aspects never reach `require()`.
 */
export class ScopeTrust {
  constructor(
    private workspace: Workspace,
    private logger: Logger
  ) {}

  /**
   * `true` when the workspace has opted in (the `trustedScopes` key is present
   * in workspace.jsonc, even as an empty array). When `false`, the aspect-load
   * gate is a no-op.
   */
  isOptedIn(): boolean {
    try {
      const ext = this.workspace.getWorkspaceConfig().extension(WORKSPACE_ASPECT_ID, true) || {};
      return Object.prototype.hasOwnProperty.call(ext, 'trustedScopes');
    } catch {
      return false;
    }
  }

  /**
   * Effective trust list, broken down by source. Useful for both internal
   * checks and the `bit scope trust list` UX.
   */
  getEffectiveTrustedPatterns(): TrustedScopesGroups {
    const configured = this.readConfiguredPatterns();
    const owner = this.getOwnerWildcardFromDefaultScope();
    return {
      builtin: BUILTIN_TRUSTED_PATTERNS.slice(),
      owner: owner ? [owner] : [],
      configured,
    };
  }

  private readConfiguredPatterns(): string[] {
    try {
      const ext = this.workspace.getWorkspaceConfig().extension(WORKSPACE_ASPECT_ID, true) || {};
      return Array.isArray(ext.trustedScopes) ? ext.trustedScopes.slice() : [];
    } catch {
      return [];
    }
  }

  /**
   * True iff `scopeName` matches any pattern in the effective trust list.
   * `scopeName` is expected to be the bare scope (e.g. `acme.frontend`).
   */
  isScopeTrusted(scopeName: string): boolean {
    if (!scopeName) return false;
    const groups = this.getEffectiveTrustedPatterns();
    const all = [...groups.builtin, ...groups.owner, ...groups.configured];
    return all.some((pattern) => ScopeTrust.matchesPattern(scopeName, pattern));
  }

  /**
   * Pattern matcher. Two forms:
   * - exact: `acme.frontend` matches only `acme.frontend`.
   * - owner wildcard: `acme.*` matches `acme.<anything>`.
   */
  static matchesPattern(scopeName: string, pattern: string): boolean {
    if (pattern === scopeName) return true;
    if (pattern.endsWith('.*')) {
      const owner = pattern.slice(0, -2);
      return scopeName.startsWith(`${owner}.`);
    }
    return false;
  }

  /** Opt the workspace in by writing `trustedScopes: []` (idempotent). */
  async enable(): Promise<void> {
    const wsConfig = this.workspace.getWorkspaceConfig();
    const existingExt = wsConfig.extension(WORKSPACE_ASPECT_ID, true) || {};
    if (Object.prototype.hasOwnProperty.call(existingExt, 'trustedScopes')) return;
    wsConfig.setExtension(WORKSPACE_ASPECT_ID, { trustedScopes: [] }, { mergeIntoExisting: true, ignoreVersion: true });
    await wsConfig.write({ reasonForChange: 'enable scope-trust' });
  }

  /**
   * Opt the workspace out by removing the `trustedScopes` key (idempotent).
   * Uses `overrideExisting` because key deletion isn't expressible via
   * mergeIntoExisting; comments on other keys may be reformatted as a result.
   */
  async disable(): Promise<void> {
    const wsConfig = this.workspace.getWorkspaceConfig();
    const existingExt = wsConfig.extension(WORKSPACE_ASPECT_ID, true) || {};
    if (!Object.prototype.hasOwnProperty.call(existingExt, 'trustedScopes')) return;
    const updated = { ...existingExt };
    delete updated.trustedScopes;
    wsConfig.setExtension(WORKSPACE_ASPECT_ID, updated, { overrideExisting: true, ignoreVersion: true });
    await wsConfig.write({ reasonForChange: 'disable scope-trust' });
  }

  /** Add `pattern` to `trustedScopes` (auto-enables if not yet). */
  async addTrustedScope(pattern: string): Promise<void> {
    if (!ScopeTrust.isValidPattern(pattern)) {
      throw new BitError(
        `invalid scope pattern: "${pattern}". use an exact scope name (e.g. "acme.frontend" or "my-scope") or an owner wildcard (e.g. "acme.*").`
      );
    }
    const wsConfig = this.workspace.getWorkspaceConfig();
    const existingExt = wsConfig.extension(WORKSPACE_ASPECT_ID, true) || {};
    const existingList: string[] = Array.isArray(existingExt.trustedScopes) ? existingExt.trustedScopes : [];
    if (existingList.includes(pattern)) return; // idempotent
    // mergeIntoExisting: only the trustedScopes key is rewritten; comments
    // and other keys in workspace.jsonc are preserved.
    wsConfig.setExtension(
      WORKSPACE_ASPECT_ID,
      { trustedScopes: [...existingList, pattern] },
      { mergeIntoExisting: true, ignoreVersion: true }
    );
    await wsConfig.write({ reasonForChange: `add trusted scope ${pattern}` });
  }

  /**
   * Remove `pattern` from `trustedScopes`. Leaves the key in place even if
   * the list becomes empty — use `disable()` to fully turn the gate off.
   */
  async removeTrustedScope(pattern: string): Promise<void> {
    const wsConfig = this.workspace.getWorkspaceConfig();
    const existingExt = wsConfig.extension(WORKSPACE_ASPECT_ID, true) || {};
    const existingList: string[] = Array.isArray(existingExt.trustedScopes) ? existingExt.trustedScopes : [];
    if (!existingList.includes(pattern)) return; // idempotent
    wsConfig.setExtension(
      WORKSPACE_ASPECT_ID,
      { trustedScopes: existingList.filter((p) => p !== pattern) },
      { mergeIntoExisting: true, ignoreVersion: true }
    );
    await wsConfig.write({ reasonForChange: `remove trusted scope ${pattern}` });
  }

  /**
   * Build the aspect-load guard. No-op when not opted in. When opted in:
   * untrusted scopes get a TTY prompt to extend the trust list, or in
   * non-TTY contexts an instructional error.
   */
  createGuard(): (componentId: ComponentID) => Promise<void> {
    return async (componentId: ComponentID) => {
      if (!this.isOptedIn()) return;
      const scopeName = componentId.scope;
      if (this.isScopeTrusted(scopeName)) return;

      // Don't prompt twice for the same untrusted scope in a single run.
      // The user's answer is persisted to workspace.jsonc on accept.
      if (this.deniedThisRun.has(scopeName)) {
        throw makeUntrustedError(scopeName, componentId);
      }

      const isInteractive = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
      if (!isInteractive) {
        throw makeUntrustedError(scopeName, componentId);
      }

      const accepted = await this.promptForTrust(scopeName, componentId);
      if (!accepted) {
        this.deniedThisRun.add(scopeName);
        throw makeUntrustedError(scopeName, componentId);
      }
      await this.addTrustedScope(scopeName);
      this.logger.consoleSuccess(`added "${scopeName}" to trustedScopes in workspace.jsonc`);
    };
  }

  private deniedThisRun = new Set<string>();

  /**
   * Returns the trust pattern derived from the workspace's `defaultScope`:
   * - `acme.frontend` → `acme.*` (owner wildcard)
   * - `my-scope` (legacy dotless) → `my-scope` (exact match)
   * - empty / unset → undefined
   */
  private getOwnerWildcardFromDefaultScope(): string | undefined {
    const defaultScope = this.workspace.defaultScope;
    if (!defaultScope) return undefined;
    if (!defaultScope.includes('.')) return defaultScope;
    const owner = defaultScope.split('.')[0];
    if (!owner) return undefined;
    return `${owner}.*`;
  }

  private async promptForTrust(scopeName: string, componentId: ComponentID): Promise<boolean> {
    try {
      const response = (await prompt({
        type: 'toggle',
        name: 'trust',
        message:
          `Aspect ${componentId.toString()} comes from scope "${scopeName}", which isn't on your workspace's trusted list.\n` +
          `Trust "${scopeName}" and add it to workspace.jsonc?`,
        enabled: 'Yes',
        disabled: 'No',
        initial: false,
      } as any)) as { trust: boolean };
      return Boolean(response.trust);
    } catch {
      // user cancelled the prompt (Ctrl+C etc.)
      return false;
    }
  }

  static isValidPattern(pattern: string): boolean {
    if (!pattern || typeof pattern !== 'string') return false;
    if (pattern.endsWith('.*')) {
      const owner = pattern.slice(0, -2);
      return /^[a-zA-Z0-9_-]+$/.test(owner);
    }
    // exact: either dotless ("my-scope") or owner.name ("acme.frontend").
    // Slash isn't allowed — scope names don't contain `/` (it separates scope
    // from component name in component IDs).
    return /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?$/.test(pattern);
  }
}

function makeUntrustedError(scopeName: string, componentId: ComponentID): BitError {
  return new BitError(
    `cannot load aspect ${componentId.toString()}: scope "${scopeName}" isn't on the workspace's trusted list.\n` +
      `\n` +
      `to trust this scope, run:\n` +
      `  bit scope trust add ${scopeName}\n` +
      `or add it to "trustedScopes" under "${WORKSPACE_ASPECT_ID}" in workspace.jsonc.`
  );
}
