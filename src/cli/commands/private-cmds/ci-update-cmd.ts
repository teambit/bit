import { ciUpdateAction } from '../../../api/scope';
import Dists from '../../../consumer/component/sources/dists';
import SpecsResults from '../../../consumer/specs-results';
import { outputJsonFile } from '../../../utils';
import { PathOsBased } from '../../../utils/path';
import { paintCiResults } from '../../chalk-box';
import { CommandOptions, LegacyCommand } from '../../legacy-command';

export default class CiUpdate implements LegacyCommand {
  name = 'ci-update <id> [scopePath]';
  description = 'run an update for build and test of a certain bit-component';
  alias = '';
  loader = true;
  opts = [
    // ['v', 'verbose [boolean]', 'showing npm verbose output for inspection'],
    ['d', 'directory [file]', 'directory to run ci-update'],
    ['k', 'keep', 'keep test environment after run (default false)'],
    ['c', 'no-cache', 'ignore component cache when creating dist file'],
    ['o', 'output [file]', 'save ci results to file system'],
  ] as CommandOptions;
  private = true;

  action(
    [id, scopePath]: [string, string | null | undefined],
    {
      // verbose = true,
      directory,
      output,
      keep = false,
      noCache = false,
    }: {
      // verbose: boolean | null | undefined,
      directory?: string;
      output?: string;
      keep: boolean;
      noCache: boolean;
    }
  ): Promise<any> {
    const verbose = true; // During ci-update we always want to see verbose outputs
    return ciUpdateAction(
      id,
      scopePath || process.cwd(),
      verbose,
      directory,
      keep,
      noCache
    ).then(({ specsResults, dists, mainFile }) => ({ specsResults, dists, mainFile, output, directory }));
  }

  report({
    specsResults,
    dists,
    output,
    directory,
  }: {
    specsResults: SpecsResults | undefined;
    dists: Dists;
    output: PathOsBased;
    directory: PathOsBased;
  }): string {
    if (!specsResults && !dists) {
      return 'no results found';
    }

    if (specsResults instanceof Error) {
      return specsResults.message;
    }
    // TODO: this is really wierd.. is that possible?
    // TODO: if yes, we should change the flow type above
    if (dists instanceof Error) {
      return dists.message;
    }
    // check if there is build results
    if (output && dists) {
      const ci = {};
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      ci.specResults = specsResults;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      ci.cwd = directory || process.cwd;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      ci.buildResults = dists;
      outputJsonFile(output, ci);
    }

    return paintCiResults({ specsResults, dists });
  }
}
