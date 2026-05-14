import type { Command } from '@teambit/cli';
import type { ComponentID } from '@teambit/component-id';
import chalk from 'chalk';
import type { StatusMain } from './status.main.runtime';
import { miniStatusCommand } from './status.commands';

export type MiniStatusOpts = {
  showIssues?: boolean;
  ignoreCircularDependencies?: boolean;
};

export class MiniStatusCmd implements Command {
  name = miniStatusCommand.name;
  description = miniStatusCommand.description;
  extendedDescription = miniStatusCommand.extendedDescription;
  arguments = miniStatusCommand.arguments;
  group = miniStatusCommand.group;
  alias = miniStatusCommand.alias;
  private = miniStatusCommand.private;
  options = miniStatusCommand.options;
  loadAspects = miniStatusCommand.loadAspects;
  loader = miniStatusCommand.loader;

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

  async json([pattern]: [string], opts: MiniStatusOpts): Promise<Record<string, any>> {
    const { modified, newComps, compWithIssues } = await this.status.statusMini(pattern, opts);
    return {
      modified: modified.map((m) => m.toStringWithoutVersion()),
      newComps: newComps.map((m) => m.toStringWithoutVersion()),
      compWithIssues: compWithIssues?.map((c) => ({
        id: c.id.toStringWithoutVersion(),
        issues: c.state.issues.toObjectIncludeDataAsString(),
      })),
    };
  }
}
