import { Command, CommandOptions } from '@teambit/cli';

import { exportAction } from '@teambit/legacy/dist/api/consumer';
import ejectTemplate from '@teambit/legacy/dist/cli/templates/eject-template';
import { BASE_DOCS_DOMAIN, CURRENT_UPSTREAM, WILDCARD_HELP } from '@teambit/legacy/dist/constants';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import chalk from 'chalk';
import R from 'ramda';

export class ExportCmd implements Command {
  name = 'export [remote] [id...]';

  description = `export components to a remote scope.
  bit export => export all staged components to their current scope
  Legacy:
  bit export <remote> [id...] => export (optionally given ids) to the specified remote
  bit export ${CURRENT_UPSTREAM} [id...] => export (optionally given ids) to their current scope
  Harmony:
  bit export [id...] => export (optionally given ids) to their current scope
  bit export <remote> <lane...> => export the specified lanes to the specified remote

  https://${BASE_DOCS_DOMAIN}/docs/export
  ${WILDCARD_HELP('export remote-scope')}`;
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
    ['l', 'lanes', 'HARMONY ONLY. export lanes'],
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
  ] as CommandOptions;
  loader = true;
  migration = true;
  group = 'collaborate';
  shortDescription = 'Export components to a remote scope';
  remoteOp = true;

  async report(
    [remote, ids]: [string, string[]],
    {
      eject = false,
      includeDependencies = false,
      setCurrentScope = false,
      all = false,
      allVersions = false,
      originDirectly = false,
      force = false,
      rewire = false,
      lanes = false,
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
      lanes,
      resumeExportId: resume,
    });
    if (R.isEmpty(componentsIds) && R.isEmpty(nonExistOnBitMap) && R.isEmpty(missingScope)) {
      return chalk.yellow('nothing to export');
    }
    const exportOutput = () => {
      if (R.isEmpty(componentsIds)) return '';
      if (remote) return chalk.green(`exported ${componentsIds.length} components to scope ${chalk.bold(remote)}`);
      return chalk.green(
        `exported the following ${componentsIds.length} component(s):\n${chalk.bold(componentsIds.join('\n'))}`
      );
    };
    const nonExistOnBitMapOutput = () => {
      // if includeDependencies is true, the nonExistOnBitMap might be the dependencies
      if (R.isEmpty(nonExistOnBitMap) || includeDependencies) return '';
      const idsStr = nonExistOnBitMap.map((id) => id.toString()).join(', ');
      return chalk.yellow(
        `${idsStr}\nexported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.\n`
      );
    };
    const missingScopeOutput = () => {
      if (R.isEmpty(missingScope)) return '';
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
    const lanesOutput = () => {
      if (!exportedLanes.length) return '';
      return chalk.green(
        `exported the following ${exportedLanes.length} lane(s):
${exportedLanes.map((l) => `${chalk.bold(l.name)} (${l.components.length} components)`).join('\n')}\n\n`
      );
    };

    return nonExistOnBitMapOutput() + missingScopeOutput() + lanesOutput() + exportOutput() + ejectOutput();
  }
}
