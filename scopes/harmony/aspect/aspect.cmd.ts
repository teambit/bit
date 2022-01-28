// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { AspectMain } from './aspect.main.runtime';

export class ListAspectCmd implements Command {
  name = 'list <component-id>';
  description = 'list all aspect names configured on a component';
  options = [];
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([name]: [string]) {
    const aspectIds = await this.aspect.listAspectsOfComponent(name);
    return aspectIds.join('\n');
  }
}

export class SetAspectCmd implements Command {
  name = 'set <pattern> <aspect-id> [config]';
  description = `set an aspect to component(s) with optional config.
enter the config as stringified JSON (e.g. '{"foo":"bar"}' ).
if no config entered, the aspect will be set with empty config ({}).`;
  shortDescription = 'set an aspect to component(s) with optional config';
  options = [];
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([pattern, aspectId, config]: [string, string, string]) {
    const configParsed = config ? JSON.parse(config) : {};
    const results = await this.aspect.setAspectsToComponents(pattern, aspectId, configParsed);
    if (!results.length) return chalk.yellow(`unable to find any matching for ${chalk.bold(pattern)} pattern`);
    return chalk.green(`the following component(s) have been successfully updated:\n${results.join('\n')}`);
  }
}

export class UnsetAspectCmd implements Command {
  name = 'unset <pattern> <aspect-id>';
  description = `unset an aspect from component(s).`;
  options = [];
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([pattern, aspectId]: [string, string]) {
    const results = await this.aspect.unsetAspectsFromComponents(pattern, aspectId);
    if (!results.length) return chalk.yellow(`unable to find any matching for ${chalk.bold(pattern)} pattern`);
    return chalk.green(`the following component(s) have been successfully updated:\n${results.join('\n')}`);
  }
}

export class GetAspectCmd implements Command {
  name = 'get <component-id>';
  description = "show aspects' data and configuration of the given component";
  options = [['d', 'debug', 'show the origins were the aspects were taken from']] as CommandOptions;
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([componentName]: [string], { debug }: { debug: boolean }) {
    const { extensions: mergedExtensions, beforeMerge } = await this.aspect.getAspectsOfComponent(componentName);

    const extensionsDetailsToString = (extensions: ExtensionDataList) =>
      extensions
        .map((e) => {
          const { name, data, config } = e.toComponentObject();
          return `${chalk.bold('name:')}   ${name}
${chalk.bold('config:')} ${JSON.stringify(config, undefined, 2)}
${chalk.bold('data:')}   ${JSON.stringify(data, undefined, 2)}
`;
        })
        .join('\n');

    if (debug) {
      const beforeMergeOutput = beforeMerge
        .map(({ origin, extensions }) => {
          const title = chalk.green.bold(`Origin: ${origin}`);
          const details = extensionsDetailsToString(extensions);
          return `${title}\n${details}`;
        })
        .join('\n\n');

      const afterMergeTitle = chalk.green.bold('Final - after merging all origins');
      const afterMergeOutput = `${afterMergeTitle}\n${extensionsDetailsToString(mergedExtensions)}`;

      return `${beforeMergeOutput}\n\n\n${afterMergeOutput}`;
    }

    return extensionsDetailsToString(mergedExtensions);
  }
}

export class AspectCmd implements Command {
  name = 'aspect <sub-command>';
  alias = '';
  description = 'manage aspects';
  options = [];
  group = 'development';
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "aspect", please run "bit aspect --help" to list the subcommands`
    );
  }
}
