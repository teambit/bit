import type { Command } from '@teambit/cli';
import { formatSuccessSummary } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import chalk from 'chalk';
import type { ScopeTrust } from './scope-trust';

const ACTIONS = ['list', 'enable', 'disable', 'add', 'remove'] as const;
type Action = (typeof ACTIONS)[number];

export class ScopeTrustCmd implements Command {
  name = 'trust [action] [pattern]';
  description = "manage which scopes are trusted to load aspects (envs, etc.) into the workspace's process";
  arguments = [
    {
      name: 'action',
      description: `one of: ${ACTIONS.join(' | ')}. defaults to "list".`,
    },
    {
      name: 'pattern',
      description: 'scope pattern (required for "add" and "remove")',
    },
  ];
  options = [];
  group = 'component-config';
  extendedDescription = `scope-trust is opt-in. when off (the default), aspects from any scope load without a check. when on, aspects from a scope outside the trust list trigger a prompt (interactive shells) or an error (non-interactive).

  bit scope trust              # same as "list"
  bit scope trust list         # show status; if on, print the effective trust list
  bit scope trust enable       # turn on (writes "trustedScopes": [] to workspace.jsonc)
  bit scope trust disable      # turn off (removes "trustedScopes" from workspace.jsonc)
  bit scope trust add <p>      # add a pattern (auto-enables if needed)
  bit scope trust remove <p>   # remove a pattern (does NOT disable when list is empty)

once on, the effective trust set is: builtin (teambit.*, bitdev.*) + the owner of defaultScope + entries listed under "trustedScopes". patterns are exact ("acme.frontend") or owner wildcard ("acme.*").`;

  constructor(private scopeTrust: ScopeTrust) {}

  async report(args: string[]): Promise<string> {
    const [rawAction, pattern] = args;
    const action = (rawAction || 'list') as Action;
    if (!ACTIONS.includes(action)) {
      throw new BitError(`unknown action "${rawAction}". valid actions: ${ACTIONS.join(', ')}.`);
    }
    switch (action) {
      case 'list':
        return this.formatList();
      case 'enable':
        await this.scopeTrust.enable();
        return formatSuccessSummary('scope-trust enabled (added trustedScopes: [] to workspace.jsonc)');
      case 'disable':
        await this.scopeTrust.disable();
        return formatSuccessSummary('scope-trust disabled (removed trustedScopes from workspace.jsonc)');
      case 'add':
        if (!pattern) throw new BitError('"add" requires a pattern. example: bit scope trust add acme.frontend');
        await this.scopeTrust.addTrustedScope(pattern);
        return formatSuccessSummary(`added ${chalk.bold(pattern)} to trustedScopes in workspace.jsonc`);
      case 'remove':
        if (!pattern) throw new BitError('"remove" requires a pattern. example: bit scope trust remove acme.frontend');
        await this.scopeTrust.removeTrustedScope(pattern);
        return formatSuccessSummary(`removed ${chalk.bold(pattern)} from trustedScopes in workspace.jsonc`);
      default:
        throw new BitError(`unknown action "${action}". valid actions: ${ACTIONS.join(', ')}.`);
    }
  }

  private formatList(): string {
    if (!this.scopeTrust.isOptedIn()) {
      return [
        chalk.bold('scope-trust is off for this workspace.'),
        'aspects from any scope load without a check.',
        '',
        'to turn on, run:',
        '  bit scope trust enable           (no scopes added; only builtins + owner-of-defaultScope auto-trusted)',
        '  bit scope trust add <pattern>    (turns on and adds the first scope)',
      ].join('\n');
    }
    const groups = this.scopeTrust.getEffectiveTrustedPatterns();
    const lines: string[] = [];
    lines.push(chalk.bold('scope-trust is on. aspects from these scopes load without a prompt:'));
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
      lines.push(`  ${chalk.dim('(none — use "bit scope trust add <pattern>" to add)')}`);
    } else {
      groups.configured.forEach((p) => lines.push(`  ${p}`));
    }
    return lines.join('\n');
  }
}
