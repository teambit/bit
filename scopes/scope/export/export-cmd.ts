import { Command, CommandOptions } from '@teambit/cli';

import { exportAction } from '@teambit/legacy/dist/api/consumer';
import ejectTemplate from '@teambit/legacy/dist/cli/templates/eject-template';
import { WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { isEmpty } from 'lodash';

export class ExportCmd implements Command {
  name = 'export [component-names...]';
  description = 'export components from the workspace to remote scopes';
  arguments = [
    {
      name: 'component-names...',
      description:
        'a list of component names or component IDs (separated by space). By default, all new component versions are exported.',
    },
  ];
  extendedDescription: string;
  alias = 'e';
  options = [
    [
      'e',
      'eject',
      'replace the exported components with their corresponding packages (to use these components without further maintaining them)',
    ],
    ['a', 'all', 'export all components, including non-staged'],
    ['', 'all-versions', 'export not only staged versions but all of them'],
    [
      '',
      'origin-directly',
      'EXPERIMENTAL. avoid export to the central hub, instead, export directly to the original scopes. not recommended!',
    ],
    [
      '',
      'resume <string>',
      'in case the previous export failed and suggested to resume with an export-id, enter the id',
    ],
    [
      '',
      'ignore-missing-artifacts',
      "EXPERIMENTAL. don't throw an error when artifact files are missing. not recommended, unless you're sure the artifacts are in the remote",
    ],
    ['j', 'json', 'show output in json format'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  group = 'collaborate';
  remoteOp = true;

  constructor(docsDomain: string) {
    this.extendedDescription = `bit export => export all staged components to their current scope, if checked out to a lane, export the lane as well
\`bit export [id...]\` => export the given ids to their current scope

https://${docsDomain}/components/exporting-components
${WILDCARD_HELP('export remote-scope')}`;
  }

  async report(
    [ids = []]: [string[]],
    {
      eject = false,
      all = false,
      allVersions = false,
      originDirectly = false,
      ignoreMissingArtifacts = false,
      resume,
    }: any
  ): Promise<string> {
    const { componentsIds, nonExistOnBitMap, missingScope, exportedLanes, ejectResults } = await exportAction({
      ids,
      eject,
      includeNonStaged: all || allVersions,
      allVersions: allVersions || all,
      originDirectly,
      resumeExportId: resume,
      ignoreMissingArtifacts,
    });
    if (isEmpty(componentsIds) && isEmpty(nonExistOnBitMap) && isEmpty(missingScope)) {
      return chalk.yellow('nothing to export');
    }
    const exportOutput = () => {
      if (isEmpty(componentsIds)) return '';
      const lanesOutput = exportedLanes.length ? ` from lane ${chalk.bold(exportedLanes[0].name)}` : '';
      return chalk.green(
        `exported the following ${componentsIds.length} component(s)${lanesOutput}:\n${chalk.bold(
          componentsIds.join('\n')
        )}`
      );
    };
    const nonExistOnBitMapOutput = () => {
      // if includeDependencies is true, the nonExistOnBitMap might be the dependencies
      if (isEmpty(nonExistOnBitMap)) return '';
      const idsStr = nonExistOnBitMap.map((id) => id.toString()).join(', ');
      return chalk.yellow(
        `${idsStr}\nexported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.\n`
      );
    };
    const missingScopeOutput = () => {
      if (isEmpty(missingScope)) return '';
      const idsStr = missingScope.map((id) => id.toString()).join(', ');
      return chalk.yellow(
        `the following component(s) were not exported: ${chalk.bold(
          idsStr
        )}.\nplease specify <remote> to export them, or set a "defaultScope" in your workspace config\n\n`
      );
    };
    const ejectOutput = () => {
      if (!ejectResults) return '';
      const output = ejectTemplate(ejectResults);
      return `\n${output}`;
    };

    return nonExistOnBitMapOutput() + missingScopeOutput() + exportOutput() + ejectOutput();
  }

  async json(
    [ids = []]: [string[]],
    {
      eject = false,
      all = false,
      allVersions = false,
      originDirectly = false,
      ignoreMissingArtifacts = false,
      resume,
    }: any
  ) {
    const results = await exportAction({
      ids,
      eject,
      includeNonStaged: all || allVersions,
      allVersions: allVersions || all,
      originDirectly,
      resumeExportId: resume,
      ignoreMissingArtifacts,
    });

    return results;
  }
}
