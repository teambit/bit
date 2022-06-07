import chalk from 'chalk';
import yn from 'yn';
import { remove } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { removePrompt } from '../../../prompts';
import RemovedObjects from '../../../scope/removed-components';
import RemovedLocalObjects from '../../../scope/removed-local-objects';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import loader from '../../loader';
import paintRemoved from '../../templates/remove-template';

export default class Remove implements LegacyCommand {
  name = 'remove <ids...>';
  description = 'remove component(s) from your workspace, or a remote scope';
  group: Group = 'collaborate';
  extendedDescription = `https://${BASE_DOCS_DOMAIN}/components/removing-components
${WILDCARD_HELP('remove')}`;
  skipWorkspace = true;
  alias = 'rm';
  opts = [
    ['r', 'remote', 'remove a component from a remote scope'],
    ['t', 'track', 'keep tracking component (default = false)'],
    ['d', 'delete-files', 'DEPRECATED (this is now the default). delete local component files'],
    ['', 'keep-files', 'keep component files (just untrack the component)'],
    [
      'f',
      'force',
      'removes the component from the scope, even if used as a dependency. WARNING: components that depend on this component will corrupt',
    ],
    ['s', 'silent', 'skip confirmation'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  async action(
    [ids]: [string[]],
    {
      force = false,
      remote = false,
      track = false,
      deleteFiles = false,
      silent = false,
      keepFiles = false,
    }: { force: boolean; remote: boolean; track: boolean; deleteFiles: boolean; silent: boolean; keepFiles: boolean }
  ): Promise<any> {
    if (deleteFiles) {
      loader.stop();
      // eslint-disable-next-line no-console
      console.warn(
        chalk.yellow(
          '--delete-files flag is deprecated. by default the files are deleted, unless --keep-files was provided'
        )
      );
    }
    if (!silent) {
      const willDeleteFiles = !remote && !keepFiles;
      const removePromptResult = await removePrompt(willDeleteFiles)();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (!yn(removePromptResult.shouldRemove)) {
        throw new GeneralError('the operation has been canceled');
      }
    }
    return remove({ ids, remote, force, track, deleteFiles: !keepFiles });
  }
  report({
    localResult,
    remoteResult = [],
  }: {
    localResult: RemovedLocalObjects;
    remoteResult: RemovedObjects[];
  }): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return paintRemoved(localResult, false) + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map((item) => paintRemoved(item, true));
  }
}
