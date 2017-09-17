/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { getDriver, bind } from '../../../api/consumer';

export default class Create extends Command {
  name = 'bind';
  description = 'Call the driver bind action';
  alias = 'b';
  opts = [['v', 'verbose', 'showing the driver path']];
  private = true;
  loader = true;

  action(args: string[], { verbose }: { verbose: ?boolean }): Promise<*> {
    // return getDriver().then((driverObj) => {
    //   return driverObj.getDriver(false).bind({});
    // });
    return bind();
  }

  report(results: Array<{ id: string, bound: Object }>): string {
    const reportComponents = results
      .map((result) => {
        const bounds = result.bound.map(bound => `\t\tFrom: ${bound.from}, To: ${bound.to}`).join('\n');
        return chalk.cyan(`\t${result.id}:\n ${bounds}`);
      })
      .join('\n');

    const reportTitle = chalk.underline(`Bound ${chalk.bold(results.length)} components\n`);

    return reportTitle + reportComponents;
  }
}
