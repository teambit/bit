import chalk from 'chalk';
import { CodemodResult } from '../../consumer/component-ops/codemod-components';

// eslint-disable-next-line import/prefer-default-export
export function codemodTemplate(results: CodemodResult[]): string {
  const reportComponents = results
    .map(result => {
      const files = result.changedFiles.map(file => `\t\tfile: ${chalk.bold(file)}`).join('\n');
      return chalk.cyan(`\t${result.id.toString()}:\n ${files}`);
    })
    .join('\n');

  const reportTitle = chalk.underline(`rewired ${chalk.bold(results.length.toString())} components\n`);

  return reportTitle + reportComponents;
}
