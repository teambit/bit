import chalk from 'chalk';
import { CommandOptions, Command } from '../cli';
import { Publisher, PublishResult, PublisherOptions } from './publisher';

type PublishArgs = [string];

export class PublishCmd implements Command {
  name = 'publish <componentId>';
  description = 'publish components to npm (npm publish)';
  options = [
    ['d', 'dry-run [boolean]', 'npm publish --dry-run'],
    ['', 'allow-staged', 'allow publish components that were not exported yet (not recommended)'],
    ['j', 'json [boolean]', 'return the output as JSON'],
  ] as CommandOptions;
  shortDescription = '';
  alias = '';
  private = true;
  group = 'collaborate';

  constructor(private publisher: Publisher) {}

  async report(args: PublishArgs, options: PublisherOptions) {
    const result = await this.json(args, options);
    const components = result.data;
    if (!components.length) return 'no components were found candidate for publish';

    const publishOrDryRun = options.dryRun ? 'dry-run' : 'published';
    const title = chalk.white.bold(`successfully ${publishOrDryRun} the following components\n`);
    const output = components
      .map((component) => {
        const compName = component.id.toString();
        const getData = () => {
          if (component.errors.length) {
            return chalk.red(component.errors.join('\n'));
          }
          return chalk.green(component.data as string);
        };
        return `${chalk.bold(compName)}\n${getData()}\n`;
      })
      .join('\n');
    return title + output;
  }

  async json([componentId]: PublishArgs, options: PublisherOptions): Promise<{ data: PublishResult[]; code: number }> {
    const compId = typeof componentId === 'string' ? componentId : componentId[0];
    const packResult = await this.publisher.publish([compId], options);
    return {
      data: packResult,
      code: 0,
    };
  }
}
