/** @flow */
import Command from '../../command';
import path from 'path';
import { outputJsonFile } from '../../../utils';
import { ciUpdateAction } from '../../../api/scope';
import SpecsResults from '../../../consumer/specs-results/specs-results';
import { paintCiResults } from '../../chalk-box';

export default class CiUpdate extends Command {
  name = 'ci-update <id> [scopePath]';
  description = 'run an update for build and test of a certain bit-component';
  alias = '';
  opts = [
    ['v', 'verbose', 'showing npm verbose output for inspection'],
    ['t', 'testDir <file>', 'directory to run ci-update'],
    ['k', 'keep', 'keep test environment after run (default false)'],
    ['s', 'save <file>', 'save ci results   to file system']
  ];
  private = true;

  action([id, scopePath]: [string, ?string, ], { verbose, testDir, save , keep = false }: { verbose: ?boolean, testDir: ?string, save: ?string, keep:boolean }): Promise<any> {
    verbose = true; // During ci-update we always want to see verbose outputs
    return ciUpdateAction(id, scopePath || process.cwd(), verbose, testDir, keep).then(({specsResults,buildResults, component}) => ({specsResults,buildResults, component, save}));
  }


  report({specsResults,buildResults, component, save}): string {
    if (!specsResults && !buildResults) { return 'no results found'; }

    if (specsResults instanceof Error) {
      return specsResults.message;
    }
    if (buildResults instanceof Error) {
      return buildResults.message;
    }
    if (save) {
      const ci ={};
      ci.specResults = specsResults;
      ci.mainDistFile = component.calculateMainDistFile();
      ci.component = component;
      ci.cwd = buildResults ? path.resolve(buildResults["0"].base, '..') : path.resolve(specsResults["0"].specFile, '..');
      ci.buildResults = buildResults;
      outputJsonFile(save, ci);
    }

    return paintCiResults({ specsResults, buildResults });
  }
}
