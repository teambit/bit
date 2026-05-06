import type { Command } from '@teambit/cli';
import { formatHint, formatItem, formatSection, formatSuccessSummary, formatTitle, joinSections } from '@teambit/cli';
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
      description: `one of: ${ACTIONS.join(', ')}. defaults to "list".`,
    },
    {
      name: 'pattern',
      description: 'scope pattern (required for "add" and "remove")',
    },
  ];
  options = [];
  group = 'component-config';
  // Don't load aspects for this command. If the workspace already references
  // an aspect from a scope that the trust list doesn't allow, the pre-command
  // aspect-load step would itself trip the gate, leaving the user with no way
  // to run `bit scope trust` to fix it. Skipping aspect-load keeps the command
  // usable as a recovery path.
  loadAspects = false;
  extendedDescription = `scope-trust is opt-in. when off (the default), aspects from any scope load without a check. when on, aspects from a scope outside the trust list trigger a prompt (interactive shells) or an error (non-interactive).

  bit scope trust                    # same as "list"
  bit scope trust list               # show status; if on, print the effective trust list
  bit scope trust enable             # turn on (writes "trustedScopes": [] to workspace.jsonc)
  bit scope trust disable            # turn off (removes "trustedScopes" from workspace.jsonc)
  bit scope trust add PATTERN        # add a pattern (auto-enables if needed)
  bit scope trust remove PATTERN     # remove a pattern (does NOT disable when list is empty)

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
        await this.scopeTrust.addTrustedScope(requirePattern(action, pattern));
        return formatSuccessSummary(`added ${chalk.bold(pattern)} to trustedScopes in workspace.jsonc`);
      case 'remove':
        await this.scopeTrust.removeTrustedScope(requirePattern(action, pattern));
        return formatSuccessSummary(`removed ${chalk.bold(pattern)} from trustedScopes in workspace.jsonc`);
    }
  }

  private formatList(): string {
    if (!this.scopeTrust.isOptedIn()) {
      return joinSections([
        formatTitle('scope-trust is off for this workspace.'),
        'aspects from any scope load without a check.',
        formatHint(
          'to turn on:\n  bit scope trust enable        (no scopes added; only builtins + owner-of-defaultScope auto-trusted)\n  bit scope trust add <pattern> (turns on and adds the first scope)'
        ),
      ]);
    }
    const groups = this.scopeTrust.getEffectiveTrustedPatterns();
    return joinSections([
      formatTitle('scope-trust is on. aspects from these scopes load without a prompt:'),
      formatSection(
        'builtin',
        '',
        groups.builtin.map((p) => formatItem(p))
      ),
      formatSection(
        'inferred from workspace defaultScope',
        '',
        groups.owner.map((p) => formatItem(p))
      ),
      groups.configured.length
        ? formatSection(
            'configured in workspace.jsonc',
            '',
            groups.configured.map((p) => formatItem(p))
          )
        : formatHint('no scopes configured in workspace.jsonc. add one with `bit scope trust add <pattern>`.'),
    ]);
  }
}

function requirePattern(action: Action, pattern: string | undefined): string {
  if (!pattern) {
    throw new BitError(`"${action}" requires a pattern. example: bit scope trust ${action} acme.frontend`);
  }
  return pattern;
}
