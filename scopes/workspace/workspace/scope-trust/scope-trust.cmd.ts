import type { Command } from '@teambit/cli';
import { formatSuccessSummary } from '@teambit/cli';
import chalk from 'chalk';
import type { ScopeTrust } from './scope-trust';

export class ScopeTrustCmd implements Command {
  name = 'trust [scope-pattern]';
  description = 'add a scope to the workspace trust list, or list trusted scopes when called without args';
  arguments = [
    {
      name: 'scope-pattern',
      description: 'scope name (e.g. "acme.frontend") or owner wildcard (e.g. "acme.*")',
    },
  ];
  options = [];
  group = 'component-config';
  extendedDescription = `trusted scopes can ship aspects (envs, generators) whose code is \`require()\`d locally during \`bit import\` / \`bit compile\`. by default the workspace trusts:
- builtin: teambit.*, bitdev.*
- the owner of the workspace's defaultScope (e.g. defaultScope "acme.frontend" trusts "acme.*")
- anything explicitly listed under "trustedScopes" in workspace.jsonc

run \`bit scope trust\` (no args) to inspect the effective list. run \`bit scope untrust <pattern>\` to remove an entry.`;

  constructor(private scopeTrust: ScopeTrust) {}

  async report(args: string[]): Promise<string> {
    const scopePattern = args[0];
    if (!scopePattern) {
      return this.formatList();
    }
    await this.scopeTrust.addTrustedScope(scopePattern);
    return formatSuccessSummary(`added ${chalk.bold(scopePattern)} to trustedScopes in workspace.jsonc`);
  }

  private formatList(): string {
    const groups = this.scopeTrust.getEffectiveTrustedPatterns();
    const lines: string[] = [];
    lines.push(chalk.bold('Trusted scopes (aspects from these scopes load without a prompt):'));
    lines.push('');
    lines.push(chalk.dim('builtin:'));
    groups.builtin.forEach((p) => lines.push(`  ${p}`));
    if (groups.owner.length) {
      lines.push('');
      lines.push(chalk.dim('inferred from workspace defaultScope:'));
      groups.owner.forEach((p) => lines.push(`  ${p}`));
    }
    lines.push('');
    lines.push(chalk.dim('configured in workspace.jsonc:'));
    if (!groups.configured.length) {
      lines.push(`  ${chalk.dim('(none — use `bit scope trust <pattern>` to add)')}`);
    } else {
      groups.configured.forEach((p) => lines.push(`  ${p}`));
    }
    return lines.join('\n');
  }
}

export class ScopeUntrustCmd implements Command {
  name = 'untrust <scope-pattern>';
  description = 'remove a scope pattern from the workspace trust list (workspace.jsonc)';
  arguments = [{ name: 'scope-pattern', description: 'pattern to remove (must match what was added)' }];
  options = [];
  group = 'component-config';
  extendedDescription = `removes <scope-pattern> from "trustedScopes" under teambit.workspace/workspace in workspace.jsonc. builtin and owner-wildcard entries cannot be removed (they are computed at runtime).`;

  constructor(private scopeTrust: ScopeTrust) {}

  async report(args: string[]): Promise<string> {
    const scopePattern = args[0];
    await this.scopeTrust.removeTrustedScope(scopePattern);
    return formatSuccessSummary(`removed ${chalk.bold(scopePattern)} from trustedScopes in workspace.jsonc`);
  }
}
