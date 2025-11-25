import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { IssuesAspect } from './issues.aspect';
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
    const issuesList = results
      .map(
        (result) => `${chalk.bold(result.name)}
${result.description}
Possible solution: ${result.solution}
Is Tag/Snap blocker: ${result.isTagBlocker ? 'yes' : 'no'}
`
      )
      .join('\n');

    const bypassInstructions = `
${chalk.yellow('━'.repeat(80))}
${chalk.yellow.bold('IGNORING ISSUES (Emergency Use Only)')}
${chalk.yellow('━'.repeat(80))}

${chalk.bold('While highly not recommended')}, it is possible to ignore issues in two ways:

${chalk.bold('1. Temporarily ignore for a single command:')}
   Use the --ignore-issues flag with tag/snap/build commands:

   ${chalk.cyan('bit tag --ignore-issues "IssueName1, IssueName2"')}
   ${chalk.cyan('bit snap --ignore-issues "IssueName1"')}
   ${chalk.cyan('bit build --ignore-issues "*"')}  ${chalk.dim('(ignores all issues)')}

${chalk.bold('2. Permanently ignore in workspace configuration:')}
   Add to your workspace.jsonc:

   ${chalk.cyan(`"${IssuesAspect.id}": {
     "ignoreIssues": ["IssueName1", "IssueName2"]
   }`)}

${chalk.yellow('⚠')}  ${chalk.bold('Warning:')} Ignoring issues may lead to broken components, failed builds,
   or other problems. Only use this in emergency situations where you understand
   the consequences and have a plan to fix the underlying issues.
`;

    return `${issuesList}\n${bypassInstructions}`;
  }

  async json() {
    return this.issues.listIssues();
  }
}
