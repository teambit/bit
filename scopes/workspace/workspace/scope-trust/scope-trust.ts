import type { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import { BitError } from '@teambit/bit-error';
import { isValidScopeName } from '@teambit/legacy-bit-id';
import { prompt } from 'enquirer';
import type { Workspace } from '../workspace';

const BUILTIN_TRUSTED_PATTERNS = ['teambit.*', 'bitdev.*'];

const WORKSPACE_ASPECT_ID = 'teambit.workspace/workspace';

const TRUSTED_SCOPES_KEY = 'trustedScopes';

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
 * - the pattern derived from the workspace's `defaultScope`
 *   (e.g. `acme.frontend` → `acme.*`; legacy dotless `my-scope` → `my-scope`),
 * - the `trustedScopes` array configured in workspace.jsonc.
 *
 * Patterns are exact (`acme.frontend`) or owner wildcard (`acme.*`).
 *
 * Wired into `ScopeMain` via `setAspectLoadGuard`; the guard runs in the
 * aspect-loader path so untrusted aspects never reach `require()`.
 */
export class ScopeTrust {
  private deniedThisRun = new Set<string>();

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
    return Object.prototype.hasOwnProperty.call(this.readExt(), TRUSTED_SCOPES_KEY);
  }

  /**
   * Effective trust list, broken down by source. Useful for both internal
   * checks and the `bit scope trust list` UX.
   */
  getEffectiveTrustedPatterns(): TrustedScopesGroups {
    const ext = this.readExt();
    const configured = Array.isArray(ext[TRUSTED_SCOPES_KEY]) ? (ext[TRUSTED_SCOPES_KEY] as string[]).slice() : [];
    const owner = this.getInferredOwnerPattern();
    return {
      builtin: BUILTIN_TRUSTED_PATTERNS.slice(),
      owner: owner ? [owner] : [],
      configured,
    };
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
    if (this.isOptedIn()) return;
    await this.writeExtPatch({ [TRUSTED_SCOPES_KEY]: [] }, 'enable scope-trust');
  }

  /**
   * Opt the workspace out by removing the `trustedScopes` key (idempotent).
   * Uses `overrideExisting` because key deletion isn't expressible via
   * `mergeIntoExisting`; comments on other keys may be reformatted as a result.
   */
  async disable(): Promise<void> {
    if (!this.isOptedIn()) return;
    const updated = { ...this.readExt() };
    delete updated[TRUSTED_SCOPES_KEY];
    const wsConfig = this.workspace.getWorkspaceConfig();
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
    await this.mutateConfiguredList(
      (list) => (list.includes(pattern) ? null : [...list, pattern]),
      `add trusted scope ${pattern}`
    );
  }

  /**
   * Remove `pattern` from `trustedScopes`. Leaves the key in place even if
   * the list becomes empty — use `disable()` to fully turn the gate off.
   */
  async removeTrustedScope(pattern: string): Promise<void> {
    await this.mutateConfiguredList(
      (list) => (list.includes(pattern) ? list.filter((p) => p !== pattern) : null),
      `remove trusted scope ${pattern}`
    );
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

      const deny = (): never => {
        throw makeUntrustedError(scopeName, componentId);
      };

      // The user's answer is persisted to workspace.jsonc on accept; remember
      // a denial so we don't re-prompt for the same scope in this run.
      if (this.deniedThisRun.has(scopeName)) deny();

      const isInteractive = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
      if (!isInteractive) deny();

      const accepted = await this.promptForTrust(scopeName, componentId);
      if (!accepted) {
        this.deniedThisRun.add(scopeName);
        deny();
      }
      await this.addTrustedScope(scopeName);
      this.logger.consoleSuccess(`added "${scopeName}" to trustedScopes in workspace.jsonc`);
    };
  }

  private readExt(): Record<string, unknown> {
    try {
      return (this.workspace.getWorkspaceConfig().extension(WORKSPACE_ASPECT_ID, true) || {}) as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  }

  /**
   * Apply `mutator` to the current `trustedScopes` list. If the mutator
   * returns `null`, treat the call as a no-op (idempotent fast path).
   * Uses `mergeIntoExisting` so other keys' comments are preserved.
   */
  private async mutateConfiguredList(mutator: (list: string[]) => string[] | null, reason: string): Promise<void> {
    const ext = this.readExt();
    const current: string[] = Array.isArray(ext[TRUSTED_SCOPES_KEY]) ? (ext[TRUSTED_SCOPES_KEY] as string[]) : [];
    const next = mutator(current);
    if (next === null) return;
    await this.writeExtPatch({ [TRUSTED_SCOPES_KEY]: next }, reason);
  }

  private async writeExtPatch(patch: Record<string, unknown>, reason: string): Promise<void> {
    const wsConfig = this.workspace.getWorkspaceConfig();
    wsConfig.setExtension(WORKSPACE_ASPECT_ID, patch, { mergeIntoExisting: true, ignoreVersion: true });
    await wsConfig.write({ reasonForChange: reason });
  }

  /**
   * Returns the trust pattern derived from the workspace's `defaultScope`:
   * - `acme.frontend` → `acme.*` (owner wildcard)
   * - `my-scope` (legacy dotless) → `my-scope` (exact match)
   * - empty / unset → undefined
   */
  private getInferredOwnerPattern(): string | undefined {
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
        // The `toggle` prompt's option type isn't exported by enquirer's main
        // typings; cast just the literal so the rest of the call stays typed.
      } as Parameters<typeof prompt>[0])) as { trust: boolean };
      return Boolean(response.trust);
    } catch {
      // user cancelled the prompt (Ctrl+C etc.)
      return false;
    }
  }

  static isValidPattern(pattern: string): boolean {
    if (!pattern || typeof pattern !== 'string') return false;
    // owner wildcard ("acme.*"): the prefix without the trailing ".*" must be
    // a valid scope-owner segment. The owner alone ("acme") is itself a valid
    // dotless scope name, so reuse the canonical scope-name validator.
    const candidate = pattern.endsWith('.*') ? pattern.slice(0, -2) : pattern;
    return isValidScopeName(candidate);
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
