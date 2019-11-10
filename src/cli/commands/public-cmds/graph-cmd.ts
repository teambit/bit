import * as path from 'path';
// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
import os from 'os';
import chalk from 'chalk';
import Command from '../../command';
import { paintGraph } from '../../../api/consumer';
import { generateRandomStr } from '../../../e2e-helper/e2e-helper';

export default class Graph extends Command {
  name = 'graph [id]';
  description = 'EXPERIMENTAL. generate an image file with the dependencies graph';
  alias = '';
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  opts = [
    ['i', 'image <image>', 'image path. use one of the following extensions: [gif, png, svg, pdf]'],
    ['r', 'remote [remoteName]', 'remote name (name is optional, leave empty when id is specified)'],
    ['', 'all-versions', 'enter all components versions into the graph, not only latest'],
    [
      '',
      'layout <name>',
      'GraphVis layout. default to "dot". options are [circo, dot, fdp, neato, osage, patchwork, sfdp, twopi]'
    ]
  ];
  remoteOp = true;

  action(
    [id]: [string],
    options: {
      image: string | null | undefined;
      remote: string | null | undefined;
      allVersions: boolean | null | undefined;
      layout: string | null | undefined;
    }
  ): Promise<any> {
    if (!options.image) {
      options.image = path.join(os.tmpdir(), `${generateRandomStr()}.png`);
    }
    return paintGraph(id, options);
  }

  report(result: string): string {
    return chalk.green(`image created at ${result}`);
  }
}
