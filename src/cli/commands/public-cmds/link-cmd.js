/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { link } from '../../../api/consumer';

export default class Create extends Command {
  name = 'link';
  description = 'Call the driver link action';
  alias = 'b';
  opts = [];
  private = true;
  loader = true;

  action(): Promise<*> {
    return link();
  }

  report(results: Array<{ id: string, bound: ?Object }>): string {
    const reportComponents = results
      .map((result) => {
        const bounds = result.bound
          .filter(bound => bound.from && bound.to)
          .map(bound => `\t\tfrom: ${bound.from}, to: ${bound.to}`)
          .join('\n');
        if (!bounds.length) {
          const reason = result.id.scope ? 'is a nested dependency' : 'was not exported yet';
          return chalk.cyan(`\t${result.id}:\n\t\tnothing to link because the component ${reason}`);
        }
        return chalk.cyan(`\t${result.id}:\n ${bounds}`);
      })
      .join('\n');

    const reportTitle = chalk.underline(`found ${chalk.bold(results.length)} components\n`);

    return reportTitle + reportComponents;
  }
}
