import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { IssuesMain } from './issues.main.runtime';

export class ComponentIssuesCmd implements Command {
  name = 'component-issues';
  description = 'list available component-issues';
  alias = '';
  group = 'info-analysis';
  options = [['j', 'json', 'output issues in json format']] as CommandOptions;
  loader = true;
  private = true;

  constructor(private issues: IssuesMain) {}

  async report() {
    const results = await this.json();
    return results
      .map(
        (result) => `${chalk.bold(result.name)}
${result.description}
Possible solution: ${result.solution}
Is Tag/Snap blocker: ${result.isTagBlocker ? 'yes' : 'no'}
`
      )
      .join('\n');
  }

  async json() {
    return this.issues.listIssues();
  }
}
