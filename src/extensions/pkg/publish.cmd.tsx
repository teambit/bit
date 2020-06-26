import chalk from 'chalk';
import { CommandOptions, Command } from '../cli';
import { Publisher } from './publisher';
import { BuildResults } from '../builder';

type PublishArgs = [string];
type PublishOptions = { dryRun: boolean };

export class PublishCmd implements Command {
  name = 'publish <componentId>';
  description = 'publish components to npm (npm publish)';
  options = [
    ['d', 'dry-run [boolean]', 'npm publish --dry-run'],
    ['j', 'json [boolean]', 'return the output as JSON']
  ] as CommandOptions;
  shortDescription = '';
  alias = '';
  private = true;
  group = 'collaborate';

  constructor(private publisher: Publisher) {}

  async report(args: PublishArgs, options: PublishOptions) {
    const result = await this.json(args, options);
    const data: BuildResults = result.data;
    const title = chalk.white.inverse.bold(' Publish Results \n');
    const output = data.components
      .map(component => {
        const compName = component.id.toString();
        const getData = () => {
          if (component.errors.length) {
            return chalk.red(component.errors.join('\n'));
          }
          return chalk.green(component.data);
        };
        return `${chalk.bold(compName)}\n${getData()}\n`;
      })
      .join('\n');
    return title + output;
  }

  async json([componentId]: PublishArgs, options: PublishOptions) {
    const compId = typeof componentId === 'string' ? componentId : componentId[0];
    const packResult = await this.publisher.publish([compId], options);
    return {
      data: packResult,
      code: 0
    };
  }
}
