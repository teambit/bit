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
      return unTagAllAction(version);
    }
    return unTagAction(id, version);
  }

  report(results): string {
    const title = chalk.bold('the following components were un-tagged:\n');
    const components = results.map((result) => {
      return `\tid: ${result.id.toStringWithoutVersion()}, versions: ${result.versions.join(', ')}`;
    });
    return title + components;
  }
}
