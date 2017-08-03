/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { getDriver } from '../../../api/consumer';

export default class Create extends Command {
  name = 'bind';
  description = 'Call the driver bind action';
  alias = 'b';
  opts = [
    ['v', 'verbose', 'showing the driver path'],
  ];
  private = true;
  loader = true;

  action(args: string[], { verbose }: { verbose: ?bool }): Promise<*> {
    return getDriver().then((driverObj) => {
      return driverObj.getDriver(false).bind({});
    });
  }

  report(result: {[string]: string}): string {
    const reportComponents = components => Object.keys(components)
    .map(component => chalk.cyan(`\t${component} => ${components[component]}`)).join('\n');

    const reportTitle = components =>
      chalk.underline(`Bound ${chalk.bold(Object.keys(components).length.toString())} components\n`);

    return reportTitle(result) + reportComponents(result);
  }
}
