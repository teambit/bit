/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { paintGraph } from '../../../api/consumer';

export default class Graph extends Command {
  name = 'graph [id]';
  description = 'generate an image file with the dependencies graph';
  alias = '';
  opts = [
    ['i', 'image <image>', 'image path. use one of the following extensions: [gif, png, svg, pdf]'],
    ['r', 'remote [remoteName]', 'remote name (name is optional, leave empty when id is specified)']
  ];

  action([id]: [string], options: { image: ?string, remote: ?string }): Promise<any> {
    if (!options.image) throw new Error('please specify image path'); // todo: generate a path in tmp dir
    return paintGraph(id, options);
  }

  report(result: string): string {
    return chalk.green(`image created at ${result}`);
  }
}
