import R from 'ramda';
import chalk from 'chalk';
import { LegacyCommand, CommandOptions } from '../../legacy-command';
import { exportAction } from '../../../api/consumer';
import { BitId } from '../../../bit-id';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP, CURRENT_UPSTREAM } from '../../../constants';
import { EjectResults } from '../../../consumer/component-ops/eject-components';
import ejectTemplate from '../../templates/eject-template';
import GeneralError from '../../../error/general-error';
import { PublishResults } from '../../../scope/component-ops/publish-during-export';

export default class Export implements LegacyCommand {
  name = 'export [remote] [id...]';
  description = `export components to a remote scope.
  bit export <remote> [id...] => export (optionally given ids) to the specified remote
  bit export ${CURRENT_UPSTREAM} [id...] => export (optionally given ids) to their current scope
  bit export => export all staged components to their current scope
  https://${BASE_DOCS_DOMAIN}/docs/export
  ${WILDCARD_HELP('export remote-scope')}`;
  alias = 'e';
  opts = [
    ['e', 'eject', 'replaces the exported components from the local scope with the corresponding packages'],
    ['a', 'all', 'export all components include non-staged'],
    [
      'd',
      'include-dependencies',
      "EXPERIMENTAL. include the component's dependencies as part of the export to the remote scope"
    ],
    [
      's',
      'set-current-scope',
      "EXPERIMENTAL. ensure the component's remote scope is set according to the target location"
    ],
    [
      'r',
      'rewire',
      'EXPERIMENTAL. when exporting to a different or new scope, replace import/require statements in the source code to match the new scope'
    ],
    ['', 'all-versions', 'export not only staged versions but all of them'],
    ['f', 'force', 'force changing a component remote without asking for a confirmation']
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  action(
    [remote, ids]: [string, string[]],
    {
      eject = false,
      includeDependencies = false,
      setCurrentScope = false,
      all = false,
      allVersions = false,
      force = false,
      rewire = false
    }: any
  ): Promise<any> {
    const currentScope = !remote || remote === CURRENT_UPSTREAM;
    if (currentScope && remote) {
      remote = '';
    }
    if (includeDependencies && !remote) {
      throw new GeneralError(
        'to use --includeDependencies, please specify a remote (the default remote gets already the dependencies)'
      );
    }
    return exportAction({
      ids,
      remote,
      eject,
      includeDependencies,
      setCurrentScope,
      includeNonStaged: all || allVersions,
      allVersions: allVersions || all,
      codemod: rewire,
      force
    }).then(results => ({
      ...results,
      remote,
      includeDependencies
    }));
  }

  report({
    componentsIds,
    nonExistOnBitMap,
    missingScope,
    ejectResults,
    publishResults,
    remote,
    includeDependencies
  }: {
    componentsIds: BitId[];
    nonExistOnBitMap: BitId[];
    missingScope: BitId[];
    ejectResults: EjectResults | null | undefined;
    publishResults: PublishResults;
    remote: string;
    includeDependencies: boolean;
  }): string {
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
      const ids = nonExistOnBitMap.map(id => id.toString()).join(', ');
      return chalk.yellow(
        `${ids}\nexported successfully. bit did not update the workspace as the component files are not tracked. this might happen when a component was tracked in a different git branch. to fix it check if they where tracked in a different git branch, checkout to that branch and resync by running 'bit import'. or stay on your branch and track the components again using 'bit add'.\n`
      );
    };
    const missingScopeOutput = () => {
      if (R.isEmpty(missingScope)) return '';
      const ids = missingScope.map(id => id.toString()).join(', ');
      return chalk.yellow(
        `the following component(s) were not exported: ${chalk.bold(
          ids
        )}.\nplease specify <remote> to export them, or set a "defaultScope" in your workspace config\n\n`
      );
    };
    const ejectOutput = () => {
      if (!ejectResults) return '';
      const output = ejectTemplate(ejectResults);
      return `\n${output}`;
    };
    const publishOutput = () => {
      if (!publishResults.failedComponents.length && !publishResults.publishedComponents.length) return '';
      const failedCompsStr = publishResults.failedComponents
        .map(failed => {
          return `${chalk.red.bold(failed.id.toString())}\n${chalk.red(failed.errors.join('\n\n'))}`;
        })
        .join('\n\n');
      const successCompsStr = publishResults.publishedComponents
        .map(success => {
          return `${chalk.white(success.id.toString())} ${chalk.white.bold(success.package)}`;
        })
        .join('\n');
      const failedTitle = `\n\n${chalk.red('failed publishing the following components\n')}`;
      const successTitle = `\n\n${chalk.green('published the following component(s) successfully\n')}`;
      const failedOutput = failedCompsStr ? failedTitle + failedCompsStr : '';
      const successOutput = successCompsStr ? successTitle + successCompsStr : '';
      return successOutput + failedOutput;
    };

    return nonExistOnBitMapOutput() + missingScopeOutput() + exportOutput() + publishOutput() + ejectOutput();
  }
}
