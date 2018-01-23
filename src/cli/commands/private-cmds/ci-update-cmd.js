/** @flow */
import Command from '../../command';
import { outputJsonFile } from '../../../utils';
import { ciUpdateAction } from '../../../api/scope';
import { paintCiResults } from '../../chalk-box';

export default class CiUpdate extends Command {
  name = 'ci-update <id> [scopePath]';
  description = 'run an update for build and test of a certain bit-component';
  alias = '';
  opts = [
    ['v', 'verbose [boolean]', 'showing npm verbose output for inspection'],
    ['d', 'directory [file]', 'directory to run ci-update'],
    ['k', 'keep', 'keep test environment after run (default false)'],
    ['o', 'output [file]', 'save ci results to file system']
  ];
  private = true;

  action(
    [id, scopePath]: [string, ?string],
    {
      verbose = false,
      directory,
      output,
      keep = false
    }: { verbose: ?boolean, directory: ?string, output: ?string, keep: boolean }
  ): Promise<any> {
    verbose = true; // During ci-update we always want to see verbose outputs
    return ciUpdateAction(id, scopePath || process.cwd(), verbose, directory, keep).then(
      ({ specsResults, dists, mainFile }) => ({ specsResults, dists, mainFile, output, directory })
    );
  }

  report({ specsResults, dists, mainFile, output, directory }): string {
    if (!specsResults && !dists) {
      return 'no results found';
    }

    if (specsResults instanceof Error) {
      return specsResults.message;
    }
    if (dists instanceof Error) {
      return dists.message;
    }
    // check if there is build results
    if (output && dists) {
      const ci = {};
      ci.specResults = specsResults;
      ci.mainDistFile = mainFile;
      ci.cwd = directory || process.cwd;
      ci.buildResults = dists;
      outputJsonFile(output, ci);
    }

    return paintCiResults({ specsResults, dists });
  }
}
