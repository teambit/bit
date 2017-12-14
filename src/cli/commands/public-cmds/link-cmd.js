/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { link } from '../../../api/consumer';

export default class Create extends Command {
  name = 'link';
  description = 'Call the driver link action';
  alias = 'b';
  opts = [['v', 'verbose', 'showing the driver path']];
  private = true;
  loader = true;

  action(args: string[], { verbose }: { verbose: ?boolean }): Promise<*> {
    return link();
  }

  report(results: Array<{ id: string, bound: Object }>): string {
    const reportComponents = results
      .map((result) => {
        const bounds = result.bound.map(bound => `\t\tfrom: ${bound.from}, to: ${bound.to}`).join('\n');
        return chalk.cyan(`\t${result.id}:\n ${bounds}`);
      })
      .join('\n');

    const reportTitle = chalk.underline(`bound ${chalk.bold(results.length)} components\n`);

    return reportTitle + reportComponents;
  }
}
