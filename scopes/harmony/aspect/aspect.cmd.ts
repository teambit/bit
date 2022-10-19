// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import { CLITable } from '@teambit/cli-table';
import chalk from 'chalk';
import { ExtensionDataList } from '@teambit/legacy/dist/consumer/config';
import { AspectMain } from './aspect.main.runtime';

export class ListAspectCmd implements Command {
  name = 'list [pattern]';
  description = 'list all aspects configured on component(s)';
  arguments = [
    {
      name: 'pattern',
      description:
        'component name, component id, or component pattern. use component pattern to select multiple components. \nuse comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button"\nwrap the pattern with quotes',
    },
  ];
  options = [['d', 'debug', 'show the origins were the aspects were taken from']] as CommandOptions;
  group = 'development';

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

export type SetAspectOptions = { merge?: boolean };

export class SetAspectCmd implements Command {
  name = 'set <pattern> <aspect-id> [config]';
  description = 'set components with an aspect to extend their development tools, metadata and (possibly) artifacts';
  arguments = [
    {
      name: 'pattern',
      description:
        'the components to extend. use component name, component id, or component pattern. use component pattern to select multiple components. use comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button". wrap the pattern with quotes',
    },
    {
      name: 'aspect-id',
      description: "the aspect's component id",
    },
    {
      name: 'config',
      description: `the aspect config. enter the config as a stringified JSON (e.g. '{"foo":"bar"}' ). when no config is provided, an aspect is set with an empty config ({}).`,
    },
  ];
  options = [
    ['m', 'merge', 'merge with an existing config if exits. (by default, it replaces the config)'],
  ] as CommandOptions;
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([pattern, aspectId, config]: [string, string, string], options: SetAspectOptions) {
    const configParsed = config ? JSON.parse(config) : {};
    const results = await this.aspect.setAspectsToComponents(pattern, aspectId, configParsed, options);
    if (!results.length) return chalk.yellow(`unable to find any matching for ${chalk.bold(pattern)} pattern`);
    return chalk.green(`the following component(s) have been successfully updated:\n${results.join('\n')}`);
  }
}

export class UpdateAspectCmd implements Command {
  name = 'update <aspect-id> [pattern]';
  description = 'update a version of an aspect';
  arguments = [
    {
      name: 'aspect-id',
      description:
        "the aspect's component id. optionally, add a version (id@version), otherwise, it finds the latest version on the remote",
    },
    {
      name: 'pattern',
      description:
        'the components to update (defaults to all components). use component name, component id, or component pattern. use component pattern to select multiple components. use comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button". wrap the pattern with quotes',
    },
  ];
  examples = [
    {
      cmd: "update scope.org/aspect '**/ui/**'",
      description: 'update "ui" components that use scope.org/aspect to use its latest version',
    },
    {
      cmd: 'bit aspect update scope.org/aspect@2.0.0',
      description: 'update all components that use scope.org/aspect to version 2.0.0 (of this aspect).',
    },
  ];
  options = [];
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([aspectId, pattern]: [string, string]) {
    const { updated, alreadyUpToDate } = await this.aspect.updateAspectsToComponents(aspectId, pattern);
    if (updated.length) {
      return chalk.green(`the following component(s) have been successfully updated:\n${updated.join('\n')}`);
    }
    if (alreadyUpToDate.length) {
      return chalk.green(
        `all ${alreadyUpToDate.length} component(s) that use this aspect are already up to date. nothing to update`
      );
    }
    return chalk.yellow(`unable to find any component that use ${chalk.bold(aspectId)}`);
  }
}

export class UnsetAspectCmd implements Command {
  name = 'unset <pattern> <aspect-id>';
  description = `unset an aspect from component(s).`;
  arguments = [
    {
      name: 'pattern',
      description:
        'the components to target. use component name, component id, or component pattern. use component pattern to select multiple components. use comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button". wrap the pattern with quotes',
    },
    {
      name: 'aspect-id',
      description: "the aspect's component id",
    },
  ];
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
  name = 'get <component-name>';
  description = 'list the aspects set on a component, as well as their config and data';
  arguments = [
    {
      name: 'component-name',
      description: 'the component name or component id',
    },
  ];
  options = [
    ['d', 'debug', 'show the origins were the aspects were taken from'],
    ['j', 'json', 'format as json'],
  ] as CommandOptions;
  group = 'development';

  constructor(private aspect: AspectMain) {}

  async report([componentName]: [string], { debug }: { debug: boolean }) {
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
      const {
        aspects,
        extensions: mergedExtensions,
        beforeMerge,
      } = await this.aspect.getAspectsOfComponentForDebugging(componentName);
      const beforeMergeOutput = beforeMerge
        .map(({ origin, extensions, extraData }) => {
          const title = chalk.green.bold(`Origin: ${origin}`);
          const details = extensionsDetailsToString(extensions);
          const moreData = extraData ? `\n${chalk.bold('Extra Data:')} ${JSON.stringify(extraData, undefined, 2)}` : '';
          return `${title}\n${details}${moreData}`;
        })
        .join('\n\n');

      const afterMergeTitle = chalk.green.bold('After merging the origins above');
      const afterMergeOutput = `${afterMergeTitle}\n${extensionsDetailsToString(mergedExtensions)}`;

      const afterFinalMergeTitle = chalk.green.bold('Final - After merging the origin above and the loaded data');
      const afterFinalMergeOutput = `${afterFinalMergeTitle}\n${extensionsDetailsToString(aspects.toLegacy())}`;

      return `${beforeMergeOutput}\n\n${afterMergeOutput}\n\n\n${afterFinalMergeOutput}`;
    }
    const aspects = await this.aspect.getAspectsOfComponent(componentName);
    const extensionDataList = aspects.toLegacy();
    return extensionsDetailsToString(extensionDataList);
  }

  async json([componentName]: [string], { debug }: { debug: boolean }) {
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
      const {
        aspects,
        extensions: mergedExtensions,
        beforeMerge,
      } = await this.aspect.getAspectsOfComponentForDebugging(componentName);
      const jsonObj: Record<string, any> = {};
      beforeMerge.forEach(({ origin, extensions, extraData }) => {
        jsonObj[origin] = {
          extensions: extensionsDetailsToObject(extensions),
          extraData,
        };
      });

      jsonObj.AfterMerge = { extensions: extensionsDetailsToObject(mergedExtensions) };
      jsonObj.FinalAfterMergeIncludeLoad = { extensions: extensionsDetailsToObject(aspects.toLegacy()) };
      return jsonObj;
    }

    const aspects = await this.aspect.getAspectsOfComponent(componentName);

    return extensionsDetailsToObject(aspects.toLegacy());
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
