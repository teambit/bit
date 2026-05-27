import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSection, formatSuccessSummary, formatHint, joinSections } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { InternalizeMain } from './internalize.main.runtime';

export type InternalizeFlags = {
  revert?: boolean;
  list?: boolean;
};

export class InternalizeCmd implements Command {
  name = 'internalize [component-pattern]';
  arguments = [{ name: 'component-pattern', description: COMPONENT_PATTERN_HELP }];
  description = 'mark components as internal to hide them by default in the UI';
  extendedDescription = `marks components as internal locally, then after snap/tag and export they become internal in the remote scope.
unlike "bit local-only", internal components are still versioned and exported - they are only hidden by default in the UI (workspace, scope and Bit Cloud).
use --revert to remove the internal mark, or --list to show the components currently marked as internal.`;
  group = 'collaborate';
  skipWorkspace = true;
  options = [
    ['r', 'revert', 'remove the internal mark from the matching components'],
    ['l', 'list', 'list the components currently marked as internal'],
    [
      'j',
      'json',
      'return the output as json (the internal components with --list, otherwise the affected component-ids)',
    ],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;

  constructor(private internalize: InternalizeMain) {}

  async report([pattern]: [string], { revert, list }: InternalizeFlags): Promise<string> {
    if (list) {
      const ids = await this.internalize.listInternal();
      if (!ids.length) return formatHint('no internal components found in the workspace');
      const items = ids.map((id) => formatItem(id.toString()));
      return formatSection('internal components', '', items);
    }
    if (!pattern) {
      throw new BitError('please specify a component-pattern, or use --list to show the internal components');
    }
    const changed = await this.internalize.setByPattern(pattern, revert);
    if (!changed.length) {
      return formatHint(
        revert
          ? `no matching components are currently internal. no changes have been made`
          : `the matching components are already internal. no changes have been made`
      );
    }
    const verb = revert ? 'uninternalized' : 'internalized';
    const summary = formatSuccessSummary(`${changed.length} component(s) have been ${verb} successfully`);
    const items = changed.map((id) => formatItem(id.toString()));
    return joinSections([summary, items.join('\n')]);
  }

  async json([pattern]: [string], { revert, list }: InternalizeFlags) {
    if (list) {
      const ids = await this.internalize.listInternal();
      return ids.map((id) => id.toString());
    }
    if (!pattern) {
      throw new BitError('please specify a component-pattern, or use --list to show the internal components');
    }
    const changed = await this.internalize.setByPattern(pattern, revert);
    return changed.map((id) => id.toString());
  }
}
