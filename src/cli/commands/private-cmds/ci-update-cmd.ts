import Command from '../../command';
import { outputJsonFile } from '../../../utils';
import { ciUpdateAction } from '../../../api/scope';
import { paintCiResults } from '../../chalk-box';
import SpecsResults from '../../../consumer/specs-results';
import Dists from '../../../consumer/component/sources/dists';
import { PathOsBased } from '../../../utils/path';

export default class CiUpdate extends Command {
  name = 'ci-update <id> [scopePath]';
  description = 'run an update for build and test of a certain bit-component';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    // ['v', 'verbose [boolean]', 'showing npm verbose output for inspection'],
    ['d', 'directory [file]', 'directory to run ci-update'],
    ['k', 'keep', 'keep test environment after run (default false)'],
    ['c', 'no-cache', 'ignore component cache when creating dist file'],
    ['o', 'output [file]', 'save ci results to file system']
  ];
  /* changed command to not private so bit will not print {"payload":"","headers":{"version":"0.12.10-dev.1"}} when it fails */
  private = false;

  action(
    [id, scopePath]: [string, string | null | undefined],
    {
      // verbose = true,
      directory,
      output,
      keep = false,
      noCache = false
    }: {
      // verbose: boolean | null | undefined,
      directory?: string;
      output?: string;
      keep: boolean;
      noCache: boolean;
    }
  ): Promise<any> {
    const verbose = true; // During ci-update we always want to see verbose outputs
    return ciUpdateAction(id, scopePath || process.cwd(), verbose, directory, keep, noCache).then(
      ({ specsResults, dists, mainFile }) => ({ specsResults, dists, mainFile, output, directory })
    );
  }

  report({
    specsResults,
    dists,
    output,
    directory
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
