import chalk from 'chalk';
import { IssuesClasses } from '@teambit/component-issues';
import { Command, CommandOptions } from '@teambit/cli';
import { NOTHING_TO_SNAP_MSG, AUTO_SNAPPED_MSG } from '@teambit/legacy/dist/constants';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import { SnappingMain, SnapResults } from './snapping.main.runtime';

export type SnapDataPerCompRaw = {
  componentId: string;
  dependencies?: string[];
  aspects?: Record<string, any>;
  message?: string;
};

export class SnapFromScopeCmd implements Command {
  name = '_snap <data>';
  description = 'snap components from a bare-scope';
  extendedDescription = `this command should be running from a new bare scope, it first imports the components it needs and then processes the snap.
the input data is a stringified JSON of an array of the following object.
{
  componentId: string;    // ids always have scope, so it's safe to parse them from string
  dependencies?: string[]; // e.g. [teambit/compiler@1.0.0, teambit/tester@1.0.0]
  aspects?: Record<string,any> // e.g. { "teambit.react/react": {}, "teambit.envs/envs": { "env": "teambit.react/react" } }
  message?: string;       // tag-message.
}
an example of the final data: '[{"componentId":"ci.remote2/comp-b","message": "first snap"}]'
`;
  alias = '';
  options = [
    ['', 'push', 'export the updated objects to the original scopes once done'],
    ['m', 'message <message>', 'log message describing the latest changes'],
    ['', 'build', 'run the build pipeline'],
    ['', 'skip-tests', 'skip running component tests during snap process'],
    ['', 'disable-snap-pipeline', 'skip the snap pipeline'],
    ['', 'force-deploy', 'run the deploy pipeline although the build failed'],
    [
      'i',
      'ignore-issues [issues]',
      `ignore component issues (shown in "bit status" as "issues found"), issues to ignore:
[${Object.keys(IssuesClasses).join(', ')}]
to ignore multiple issues, separate them by a comma and wrap with quotes. to ignore all issues, specify "*".`,
    ],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private snapping: SnappingMain, private logger: Logger) {}

  async report(
    [data]: [string],
    {
      push = false,
      message = '',
      ignoreIssues,
      build = false,
      skipTests = false,
      disableSnapPipeline = false,
      forceDeploy = false,
    }: {
      push?: boolean;
      message?: string;
      ignoreIssues?: string;
      build?: boolean;
      skipTests?: boolean;
      disableSnapPipeline?: boolean;
      forceDeploy?: boolean;
    }
  ) {
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (disableTagAndSnapPipelines && forceDeploy) {
      throw new BitError('you can use either force-deploy or disable-snap-pipeline, but not both');
    }

    const snapDataPerCompRaw = this.parseData(data);

    const results = await this.snapping.snapFromScope(snapDataPerCompRaw, {
      push,
      message,
      ignoreIssues,
      build,
      skipTests,
      disableTagAndSnapPipelines,
      forceDeploy,
    });

    if (!results) return chalk.yellow(NOTHING_TO_SNAP_MSG);
    const { snappedComponents, autoSnappedResults, warnings, newComponents, laneName }: SnapResults = results;
    const changedComponents = snappedComponents.filter(
      (component) => !newComponents.searchWithoutVersion(component.id)
    );
    const addedComponents = snappedComponents.filter((component) => newComponents.searchWithoutVersion(component.id));
    const autoTaggedCount = autoSnappedResults ? autoSnappedResults.length : 0;

    const warningsOutput = warnings && warnings.length ? `${chalk.yellow(warnings.join('\n'))}\n\n` : '';
    const tagExplanation = `\n(use "bit export" to push these components to a remote")
(use "bit reset" to unstage versions)\n`;

    const outputComponents = (comps) => {
      return comps
        .map((component) => {
          let componentOutput = `     > ${component.id.toString()}`;
          const autoTag = autoSnappedResults.filter((result) =>
            result.triggeredBy.searchWithoutScopeAndVersion(component.id)
          );
          if (autoTag.length) {
            const autoTagComp = autoTag.map((a) => a.component.id.toString());
            componentOutput += `\n       ${AUTO_SNAPPED_MSG} (${autoTagComp.length} total):
            ${autoTagComp.join('\n            ')}`;
          }
          return componentOutput;
        })
        .join('\n');
    };

    const outputIfExists = (label, explanation, components) => {
      if (!components.length) return '';
      return `\n${chalk.underline(label)}\n(${explanation})\n${outputComponents(components)}\n`;
    };
    const laneStr = laneName ? ` on "${laneName}" lane` : '';

    return (
      warningsOutput +
      chalk.green(`${snappedComponents.length + autoTaggedCount} component(s) snapped${laneStr}`) +
      tagExplanation +
      outputIfExists('new components', 'first version for components', addedComponents) +
      outputIfExists('changed components', 'components that got a version bump', changedComponents)
    );
  }
  private parseData(data: string): SnapDataPerCompRaw[] {
    let dataParsed: unknown;
    try {
      dataParsed = JSON.parse(data);
    } catch (err: any) {
      throw new Error(`failed parsing the data entered as JSON. err ${err.message}`);
    }
    if (!Array.isArray(dataParsed)) {
      throw new Error('expect data to be an array');
    }
    dataParsed.forEach((dataItem) => {
      if (!dataItem.componentId) throw new Error('expect data item to have "componentId" prop');
    });
    return dataParsed;
  }
}
