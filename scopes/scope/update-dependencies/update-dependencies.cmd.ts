import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { BuildStatus } from 'bit-bin/dist/constants';
import { Logger } from '@teambit/logger';
import { UpdateDependenciesMain, UpdateDepsOptions, DepUpdateItemRaw } from './update-dependencies.main.runtime';

export class UpdateDependenciesCmd implements Command {
  name = 'update-dependencies <data>';
  description = `update dependencies for components and tag/snap the results.
the input data is a stringified JSON of an array of the following object.
{
  componentId: string; // ids always have scope, so it's safe to parse them from string
  dependencies: string[]; // e.g. [teambit/compiler@1.0.0, teambit/tester@1.0.0]
  versionToTag?: string; // specific version (e.g. '1.0.0') or semver (e.g. 'minor', 'patch')
}
an example of the final data: '[{"componentId":"ci.remote2/comp-b","dependencies":["ci.remote/comp1@0.0.2"]}]'
`;
  alias = '';
  group = 'component';
  options = [
    ['', 'tag', 'tag once the build is completed'],
    ['', 'snap', 'snap once the build is completed'],
    ['', 'output <dir>', 'save the updated objects to the given dir'],
    ['', 'multiple', 'components are from different scopes'],
    ['', 'message <string>', 'message to be saved as part of the version log'],
    ['', 'username <string>', 'username to be saved as part of the version log'],
    ['', 'email <string>', 'email to be saved as part of the version log'],
  ] as CommandOptions;

  constructor(
    private updateDependenciesMain: UpdateDependenciesMain,
    private scope: ScopeMain,
    private logger: Logger
  ) {}

  async report([data]: [string], updateDepsOptions: UpdateDepsOptions) {
    const depsUpdateItems = this.parseData(data);
    const results = await this.updateDependenciesMain.updateDependenciesVersions(depsUpdateItems, updateDepsOptions);
    const status = results.error ? BuildStatus.Failed : BuildStatus.Succeed;
    const error = results.error ? `${results.error}\n\n` : '';
    const color = error ? 'red' : 'green';
    const signed = `the following ${results.components.length} component(s) were updated with build-status "${status}"
${results.components.map((c) => c.id.toString()).join('\n')}`;
    return {
      data: error + chalk.bold[color](signed),
      code: error ? 1 : 0,
    };
  }

  private parseData(data: string): DepUpdateItemRaw[] {
    let dataParsed: unknown;
    try {
      dataParsed = JSON.parse(data);
    } catch (err) {
      throw new Error(`failed parsing the data entered as JSON. err ${err.message}`);
    }
    if (!Array.isArray(dataParsed)) {
      throw new Error('expect data to be an array');
    }
    dataParsed.forEach((dataItem) => {
      if (!dataItem.componentId) throw new Error('expect data item to have "componentId" prop');
      if (!dataItem.dependencies) throw new Error('expect data item to have "dependencies" prop');
    });
    return dataParsed;
  }
}
