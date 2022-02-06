// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { CLITable } from '@teambit/cli-table';
import chalk from 'chalk';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { AspectMain } from './aspect.main.runtime';

export class ListAspectCmd implements Command {
  name = 'list [pattern]';
  description = 'list all aspects configured on component(s)';
  options = [['d', 'debug', 'show the origins were the aspects were taken from']] as CommandOptions;
  group = 'development';
  extendedDescription = `${PATTERN_HELP('aspect list')}`;

  constructor(private aspect: AspectMain) {}

  async report([name]: [string], { debug }: { debug: boolean }) {
    const listAspectsResults = await this.aspect.listAspectsOfComponent(name);
    const rows = Object.keys(listAspectsResults).map((componentId) => {
      const longestAspectName = Math.max(...listAspectsResults[componentId].map((_) => _.aspectName.length));
      const aspects = listAspectsResults[componentId]
        .map((aspectSource) => {
          const origin = debug ? ` (origin: ${aspectSource.source})` : '';
          const aspectName = aspectSource.aspectName.padEnd(longestAspectName);
          return `${aspectName} (level: ${aspectSource.level})${origin}`;
        })
        .join('\n');

      return [componentId, aspects];
    });
    const table = new CLITable([], rows);
    return table.render();
  }
}

export class SetAspectCmd implements Command {
  name = 'set <pattern> <aspect-id> [config]';
  description = 'set an aspect to component(s) with optional config.';
  extendedDescription = `enter the config as stringified JSON (e.g. '{"foo":"bar"}' ).
if no config entered, the aspect will be set with empty config ({}).
${PATTERN_HELP('aspect set')}`;
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
  extendedDescription = `${PATTERN_HELP('aspect unset')}`;
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
  options = [
    ['d', 'debug', 'show the origins were the aspects were taken from'],
    ['j', 'json', 'format as json'],
  ] as CommandOptions;
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([componentName]: [string], { debug }: { debug: boolean }) {
    const { extensions: mergedExtensions, beforeMerge } = await this.aspect.getAspectsOfComponent(componentName);

    const extensionsDetailsToString = (extensions: ExtensionDataList) =>
      extensions
        .map((e) => {
          const { name, data, config, extensionId } = e.toComponentObject();
          return `${chalk.bold('name:')}   ${name || extensionId?.toString()}
${chalk.bold('config:')} ${JSON.stringify(config, undefined, 2)}
${chalk.bold('data:')}   ${JSON.stringify(data, undefined, 2)}
`;
        })
        .join('\n');

    if (debug) {
      const beforeMergeOutput = beforeMerge
        .map(({ origin, extensions, extraData }) => {
          const title = chalk.green.bold(`Origin: ${origin}`);
          const details = extensionsDetailsToString(extensions);
          const moreData = extraData ? `\n${chalk.bold('Extra Data:')} ${JSON.stringify(extraData, undefined, 2)}` : '';
          return `${title}\n${details}${moreData}`;
        })
        .join('\n\n');

      const afterMergeTitle = chalk.green.bold('Final - after merging all origins');
      const afterMergeOutput = `${afterMergeTitle}\n${extensionsDetailsToString(mergedExtensions)}`;

      return `${beforeMergeOutput}\n\n\n${afterMergeOutput}`;
    }

    return extensionsDetailsToString(mergedExtensions);
  }

  async json([componentName]: [string], { debug }: { debug: boolean }) {
    const { extensions: mergedExtensions, beforeMerge } = await this.aspect.getAspectsOfComponent(componentName);

    const extensionsDetailsToObject = (extensions: ExtensionDataList) =>
      extensions.reduce((acc, current) => {
        const { name, data, config, extensionId } = current.toComponentObject();
        const aspectName = name || extensionId?.toString() || '<no-name>';
        acc[aspectName] = {
          name: aspectName,
          config,
          data,
        };
        return acc;
      }, {});

    if (debug) {
      const jsonObj: Record<string, any> = {};
      beforeMerge.forEach(({ origin, extensions, extraData }) => {
        jsonObj[origin] = {
          extensions: extensionsDetailsToObject(extensions),
          extraData,
        };
      });

      jsonObj.FinalAfterMerge = { extensions: extensionsDetailsToObject(mergedExtensions) };
      return jsonObj;
    }

    return extensionsDetailsToObject(mergedExtensions);
  }
}

export class AspectCmd implements Command {
  name = 'aspect <sub-command>';
  alias = '';
  description = 'EXPERIMENTAL. manage aspects';
  options = [];
  group = 'development';
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "aspect", please run "bit aspect --help" to list the subcommands`
    );
  }
}
