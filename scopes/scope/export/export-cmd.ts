import { Command, CommandOptions } from '@teambit/cli';
import ejectTemplate from '@teambit/legacy/dist/cli/templates/eject-template';
import { WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { isEmpty } from 'lodash';
import { ExportMain } from './export.main.runtime';

export class ExportCmd implements Command {
  name = 'export [component-patterns...]';
  description = 'export components from the workspace to remote scopes';
  arguments = [
    {
      name: 'component-patterns...',
      description:
        'component IDs, component names, or component patterns (separated by space). Use patterns to export groups of components using a common scope or namespace. E.g., "utils/*" (wrap with double quotes)',
    },
  ];
  extendedDescription = `bit export => export all staged components to their current scope, if checked out to a lane, export the lane as well
  \`bit export [id...]\` => export the given ids to their current scope
  ${WILDCARD_HELP('export remote-scope')}`;
  alias = 'e';
  helpUrl = 'docs/components/exporting-components';
  options = [
    [
      'e',
      'eject',
      'replace the exported components with their corresponding packages (to use these components without further maintaining them)',
    ],
    [
      'a',
      'all',
      'export all components, including non-staged (useful when components in the remote scope are corrupted or missing)',
    ],
    [
      '',
      'all-versions',
      'export not only staged versions but all of them (useful when versions in the remote scope are corrupted or missing)',
    ],
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

  constructor(private exportMain: ExportMain) {}

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
    const { componentsIds, nonExistOnBitMap, removedIds, missingScope, exportedLanes, ejectResults } =
      await this.exportMain.export({
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
    const removedOutput = () => {
      if (!removedIds.length) return '';
      const title = chalk.bold(`\n\nthe following component(s) have been marked as removed on the remote\n`);
      const idsStr = removedIds.join('\n');
      return title + idsStr;
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

    return nonExistOnBitMapOutput() + missingScopeOutput() + exportOutput() + ejectOutput() + removedOutput();
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
    const results = await this.exportMain.export({
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
