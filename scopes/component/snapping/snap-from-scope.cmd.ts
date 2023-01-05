import chalk from 'chalk';
import { IssuesClasses } from '@teambit/component-issues';
import { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { Logger } from '@teambit/logger';
import { SnappingMain } from './snapping.main.runtime';

export type SnapDataPerCompRaw = {
  componentId: string;
  dependencies?: string[];
  aspects?: Record<string, any>;
  message?: string;
};

type SnapFromScopeOptions = {
  push?: boolean;
  message?: string;
  lane?: string;
  ignoreIssues?: string;
  build?: boolean;
  skipTests?: boolean;
  disableSnapPipeline?: boolean;
  forceDeploy?: boolean;
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
    ['', 'lane <lane-id>', 'fetch the components from the given lane'],
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
    ['j', 'json', 'output as json format'],
  ] as CommandOptions;
  loader = true;
  private = true;
  migration = true;

  constructor(private snapping: SnappingMain, private logger: Logger) {}

  async report([data]: [string], options: SnapFromScopeOptions) {
    const results = await this.json([data], options);

    const { snappedIds, exportedIds } = results;

    const snappedOutput = `${chalk.bold('snapped components')}\n${snappedIds.join('\n')}`;
    const exportedOutput =
      exportedIds && exportedIds.length ? `\n\n${chalk.bold('exported components')}\n${exportedIds.join('\n')}` : '';

    return `${snappedOutput}${exportedOutput}`;
  }
  async json(
    [data]: [string],
    {
      push = false,
      message = '',
      lane,
      ignoreIssues,
      build = false,
      skipTests = false,
      disableSnapPipeline = false,
      forceDeploy = false,
    }: SnapFromScopeOptions
  ) {
    const disableTagAndSnapPipelines = disableSnapPipeline;
    if (disableTagAndSnapPipelines && forceDeploy) {
      throw new BitError('you can use either force-deploy or disable-snap-pipeline, but not both');
    }

    const snapDataPerCompRaw = this.parseData(data);

    const results = await this.snapping.snapFromScope(snapDataPerCompRaw, {
      push,
      message,
      lane,
      ignoreIssues,
      build,
      skipTests,
      disableTagAndSnapPipelines,
      forceDeploy,
    });

    return results;
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
