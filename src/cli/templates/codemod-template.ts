import chalk from 'chalk';
import { CodemodResult } from '../../consumer/component-ops/codemod-components';

// eslint-disable-next-line import/prefer-default-export
export function codemodTemplate(results: CodemodResult[]): string {
  const reportComponents = results
    .map(result => {
      const files = result.changedFiles.map(file => `\t\tfile: ${chalk.bold(file)}`).join('\n');
      const warnings = result.warnings
        ? result.warnings.map(warning => `\t\twarning: ${chalk.cyan(warning)}`).join('\n')
        : '';
      return chalk.cyan(`\t${result.id.toString()}:\n ${files} ${warnings}`);
    })
    .join('\n');

  const numOfCodemod = results.filter(r => r.changedFiles.length).length;
  const reportTitle = chalk.underline(`rewired ${numOfCodemod} components\n`);

  return reportTitle + reportComponents;
}
