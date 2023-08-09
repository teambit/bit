import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { ComponentID } from '@teambit/component-id';
import chalk from 'chalk';
import { StatusMain } from './status.main.runtime';

export type MiniStatusOpts = {
  showIssues?: Boolean;
};

export default class MiniStatusCmd implements Command {
  name = 'mini-status [component-pattern]';
  description = 'EXPERIMENTAL. basic status for fast execution';
  extendedDescription = `shows only modified/new components. for the full status, use "bit status".
the modified are components that their source code have changed, it doesn't check for config/aspect changes`;
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'development';
  alias = 'ms';
  options = [
    ['', 'show-issues', 'show component issues (slows down the command)'],
    ['j', 'json', 'json format'],
  ] as CommandOptions;
  loader = true;

  constructor(private status: StatusMain) {}

  async report([pattern]: [string], opts: MiniStatusOpts) {
    const { modified, newComps, compWithIssues } = await this.status.statusMini(pattern, opts);
    const outputSection = (title: string, ids: ComponentID[]) => {
      const titleStr = chalk.bold(title);
      const idsStr = ids.length ? ids.map((id) => id.toStringWithoutVersion()).join('\n') : '<none>';
      return `${titleStr}:\n${idsStr}`;
    };
    const outputCompWithIssues = () => {
      if (!opts.showIssues) return '';
      if (!compWithIssues?.length) return '<none>';
      const titleStr = chalk.bold('\n\ncomponent with issues');
      const issues = compWithIssues.map((c) => `${c.id.toStringWithoutVersion()}\n  ${c.state.issues.outputForCLI()}`);
      return `${titleStr}\n${issues}`;
    };
    const modifiedOutput = outputSection('modified components (files only)', modified);
    const newOutput = outputSection('new components', newComps);
    const compWithIssuesOutput = outputCompWithIssues();
    return `${modifiedOutput}\n\n${newOutput}${compWithIssuesOutput}`;
  }

  async json([pattern]: [string], opts: MiniStatusOpts) {
    const { modified, newComps, compWithIssues } = await this.status.statusMini(pattern, opts);
    return {
      modified: modified.map((m) => m.toStringWithoutVersion()),
      newComps: newComps.map((m) => m.toStringWithoutVersion()),
      compWithIssues: compWithIssues?.map((c) => ({
        id: c.id.toStringWithoutVersion(),
        issues: c.state.issues.toReadableByIDE(),
      })),
    };
  }
}
