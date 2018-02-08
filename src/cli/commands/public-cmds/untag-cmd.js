/** @flow */
import Command from '../../command';
import { unTagAction, unTagAllAction } from '../../../api/consumer';

const chalk = require('chalk');

export default class Untag extends Command {
  name = 'untag [id] [version]';
  description = 'revert "tag" operation';
  alias = '';
  opts = [['a', 'all', 'revert tag for all tagged components']];
  loader = true;
  migration = true;

  action([id, version]: string[], { all }: { all: ?boolean }): Promise<any> {
    if (!id && !all) {
      throw new Error('Please specify an id or use --all flag');
    }

    if (all) {
      version = id;
      return unTagAllAction(version);
    }
    return unTagAction(id, version);
  }

  report(results): string {
    const title = chalk.green(`${results.length} component(s) were un-tagged:\n`);
    const components = results.map((result) => {
      return `\t${chalk.cyan(result.id.toStringWithoutVersion())}. Version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n');
  }
}
