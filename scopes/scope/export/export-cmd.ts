import { Command, CommandOptions } from '@teambit/cli';

import { exportAction } from '@teambit/legacy/dist/api/consumer';
import ejectTemplate from '@teambit/legacy/dist/cli/templates/eject-template';
import { CURRENT_UPSTREAM, WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import chalk from 'chalk';
import { isEmpty } from 'lodash';

export class ExportCmd implements Command {
  name = 'export [remote] [id...]';
  description = 'Export components to a remote scope';
  alias = 'e';
  options = [
    ['e', 'eject', 'replaces the exported components from the local scope with the corresponding packages'],
    ['a', 'all', 'export all components include non-staged'],
    [
      'd',
      'include-dependencies',
      "LEGACY ONLY. include the component's dependencies as part of the export to the remote scope",
    ],
    [
      's',
      'set-current-scope',
      "LEGACY ONLY. ensure the component's remote scope is set according to the target location",
    ],
    [
      'r',
      'rewire',
      'LEGACY ONLY. when exporting to a different or new scope, replace import/require statements in the source code to match the new scope',
    ],
    ['f', 'force', 'force changing a component remote without asking for a confirmation'],
    ['', 'all-versions', 'export not only staged versions but all of them'],
    [
      '',
      'origin-directly',
      'HARMONY ONLY. avoid export to the central hub, instead, export directly to the original scopes. not recommended!',
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

  constructor(private docsDomain: string) {
    this.description = `export components to a remote scope.
bit export => export all staged components to their current scope, if checked out to a lane, export the lane as well
\`bit export [id...]\` => export the given ids to their current scope

https://${docsDomain}/components/exporting-components
${WILDCARD_HELP('export remote-scope')}`;
  }

  async report(
    [remote, ids = []]: [string, string[]],
    {
      eject = false,
      includeDependencies = false,
      setCurrentScope = false,
      all = false,
      allVersions = false,
      originDirectly = false,
      force = false,
      rewire = false,
      ignoreMissingArtifacts = false,
      resume,
    }: any
  ): Promise<string> {
    const currentScope = !remote || remote === CURRENT_UPSTREAM;
    if (currentScope && remote) {
      remote = '';
    }
    if (includeDependencies && !remote) {
      throw new GeneralError(
        'to use --includeDependencies, please specify a remote (the default remote gets already the dependencies)'
      );
    }
    const { componentsIds, nonExistOnBitMap, missingScope, exportedLanes, ejectResults } = await exportAction({
      ids,
      remote,
      eject,
      includeDependencies,
      setCurrentScope,
      includeNonStaged: all || allVersions,
      allVersions: allVersions || all,
      originDirectly,
      codemod: rewire,
      force,
      resumeExportId: resume,
      ignoreMissingArtifacts,
    });
    if (isEmpty(componentsIds) && isEmpty(nonExistOnBitMap) && isEmpty(missingScope)) {
      return chalk.yellow('nothing to export');
    }
    const exportOutput = () => {
      if (isEmpty(componentsIds)) return '';
      const lanesOutput = exportedLanes.length ? ` from lane ${chalk.bold(exportedLanes[0].name)}` : '';
      if (remote)
        return chalk.green(`exported ${componentsIds.length} components${lanesOutput} to scope ${chalk.bold(remote)}`);
      return chalk.green(
        `exported the following ${componentsIds.length} component(s)${lanesOutput}:\n${chalk.bold(
          componentsIds.join('\n')
        )}`
      );
    };
    const nonExistOnBitMapOutput = () => {
      // if includeDependencies is true, the nonExistOnBitMap might be the dependencies
      if (isEmpty(nonExistOnBitMap) || includeDependencies) return '';
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
    [remote, ids = []]: [string, string[]],
    {
      eject = false,
      includeDependencies = false,
      setCurrentScope = false,
      all = false,
      allVersions = false,
      originDirectly = false,
      force = false,
      rewire = false,
      ignoreMissingArtifacts = false,
      resume,
    }: any
  ) {
    const currentScope = !remote || remote === CURRENT_UPSTREAM;
    if (currentScope && remote) {
      remote = '';
    }
    if (includeDependencies && !remote) {
      throw new GeneralError(
        'to use --includeDependencies, please specify a remote (the default remote gets already the dependencies)'
      );
    }
    const results = await exportAction({
      ids,
      remote,
      eject,
      includeDependencies,
      setCurrentScope,
      includeNonStaged: all || allVersions,
      allVersions: allVersions || all,
      originDirectly,
      codemod: rewire,
      force,
      resumeExportId: resume,
      ignoreMissingArtifacts,
    });

    return results;
  }
}
