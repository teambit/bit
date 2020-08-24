import chalk from 'chalk';

import { LinksResult } from '../../links/node-modules-linker';

export default (results: LinksResult[]): string => {
  const reportComponents = results
    .map((result) => {
      const bounds = result.bound
        .filter((bound) => bound.from && bound.to)
        .map((bound) => `\t\toriginal path: ${chalk.bold(bound.from)}, link path: ${chalk.bold(bound.to)}`)
        .join('\n');
      if (!bounds.length) {
        const reason = result.id.scope ? 'is a nested dependency' : 'was not exported yet';
        return chalk.cyan(`\t${result.id.toString()}:\n\t\tnothing to link because the component ${reason}`);
      }
      return chalk.cyan(`\t${result.id.toString()}:\n ${bounds}`);
    })
    .join('\n');

  const reportTitle = chalk.underline(`linked ${chalk.bold(results.length.toString())} components\n`);

  return reportTitle + reportComponents;
};
