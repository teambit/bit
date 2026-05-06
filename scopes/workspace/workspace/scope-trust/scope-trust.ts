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
 * Workspace-level scope-trust policy. Determines which scopes' aspects
 * (envs, generators, etc.) may be loaded into the host process.
 *
 * A scope is trusted if it matches any pattern in:
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
   * Effective trust list, broken down by source. Useful for both internal
   * checks and the `bit scope trust` listing UX.
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

  /** Add `pattern` to `trustedScopes` in workspace.jsonc and persist. */
  async addTrustedScope(pattern: string): Promise<void> {
    if (!ScopeTrust.isValidPattern(pattern)) {
      throw new BitError(
        `invalid scope pattern: "${pattern}". Use an exact scope name (e.g. "acme.frontend") or an owner wildcard (e.g. "acme.*").`
      );
    }
    const wsConfig = this.workspace.getWorkspaceConfig();
    const existingExt = wsConfig.extension(WORKSPACE_ASPECT_ID, true) || {};
    const existingList: string[] = Array.isArray(existingExt.trustedScopes) ? existingExt.trustedScopes : [];
    if (existingList.includes(pattern)) return; // idempotent
    const updated = { ...existingExt, trustedScopes: [...existingList, pattern] };
    wsConfig.setExtension(WORKSPACE_ASPECT_ID, updated, { overrideExisting: true, ignoreVersion: true });
    await wsConfig.write({ reasonForChange: `add trusted scope ${pattern}` });
  }

  /** Remove `pattern` from `trustedScopes` in workspace.jsonc and persist. */
  async removeTrustedScope(pattern: string): Promise<void> {
    const wsConfig = this.workspace.getWorkspaceConfig();
    const existingExt = wsConfig.extension(WORKSPACE_ASPECT_ID, true) || {};
    const existingList: string[] = Array.isArray(existingExt.trustedScopes) ? existingExt.trustedScopes : [];
    if (!existingList.includes(pattern)) return; // idempotent
    const updated = { ...existingExt, trustedScopes: existingList.filter((p) => p !== pattern) };
    wsConfig.setExtension(WORKSPACE_ASPECT_ID, updated, { overrideExisting: true, ignoreVersion: true });
    await wsConfig.write({ reasonForChange: `remove trusted scope ${pattern}` });
  }

  /**
   * Build the guard that scope-aspects-loader calls before each `require()`.
   * Throws to refuse the load. Throws with TOFU-prompt outcome on TTY,
   * otherwise with a clear instructional error.
   */
  createGuard(): (componentId: ComponentID) => Promise<void> {
    return async (componentId: ComponentID) => {
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

  private getOwnerWildcardFromDefaultScope(): string | undefined {
    const defaultScope = this.workspace.defaultScope;
    if (!defaultScope) return undefined;
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
          `Component ${componentId.toString()} uses an env from scope "${scopeName}", which isn't on your workspace's trusted list.\n` +
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
    // exact: owner.name
    return /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_./-]+$/.test(pattern);
  }
}

function makeUntrustedError(scopeName: string, componentId: ComponentID): BitError {
  return new BitError(
    `cannot load aspect ${componentId.toString()}: scope "${scopeName}" isn't on the workspace's trusted list.\n` +
      `\n` +
      `to trust this scope, run:\n` +
      `  bit scope trust ${scopeName}\n` +
      `or add it to "trustedScopes" under "${WORKSPACE_ASPECT_ID}" in workspace.jsonc.`
  );
}
