import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';
import { Logger } from '@teambit/logger';
import {
  UpdateDependenciesMain,
  UpdateDepsOptions,
  DepUpdateItemRaw,
  DepUpdateItem,
} from './update-dependencies.main.runtime';

export class UpdateDependenciesCmd implements Command {
  name = 'update-dependencies <data>';
  private = true;
  shortDescription = 'update dependencies for components and tag/snap the results';
  description = `update versions dependencies for components and tag/snap the results.
this command should be running from a new bare scope, it first imports the components it needs and then processes the update.
the input data is a stringified JSON of an array of the following object.
{
  componentId: string; // ids always have scope, so it's safe to parse them from string
  dependencies: string[]; // e.g. [teambit/compiler@1.0.0, teambit/tester@1.0.0]
  versionToTag?: string; // specific version (e.g. '1.0.0') or semver (e.g. 'minor', 'patch')
}
an example of the final data: '[{"componentId":"ci.remote2/comp-b","dependencies":["ci.remote/comp1@0.0.2"]}]'
`;
  alias = '';
  group = 'development';
  options = [
    ['', 'tag', 'tag once the build is completed (by default it snaps)'],
    ['', 'push', 'export the updated objects to the original scopes once tagged/snapped'],
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
    const componentOutput = (depUpdateItem: DepUpdateItem) => {
      const title = chalk.bold(depUpdateItem.component.id.toString());
      const dependencies = depUpdateItem.dependencies.map((dep) => `\t${dep.toString()}`).join('\n');
      return `${title}\n${dependencies}`;
    };
    return `the following ${results.depsUpdateItems.length} component(s) were updated:
${results.depsUpdateItems.map((d) => componentOutput(d)).join('\n\n')}`;
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
