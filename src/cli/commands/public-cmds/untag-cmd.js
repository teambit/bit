/** @flow */
import Command from '../../command';
import { unTagAction, unTagAllAction } from '../../../api/consumer';

const chalk = require('chalk');

export default class Untag extends Command {
  name = 'untag [id] [version]';
  description = 'revert version(s) tagged for component(s)\n  https://docs.bitsrc.io/docs/cli-untag.html';
  alias = '';
  opts = [
    ['a', 'all', 'revert tag for all tagged components'],
    ['f', 'force', 'revert tag although the tag is used as a dependency']
  ];
  loader = true;
  migration = true;

  action([id, version]: string[], { all, force }: { all: ?boolean, force: ?boolean }): Promise<any> {
    if (!id && !all) {
      throw new Error('please specify a component ID or use --all flag');
    }

    if (all) {
      version = id;
      return unTagAllAction(version, force);
    }
    return unTagAction(id, version, force);
  }

  report(results): string {
    const title = chalk.green(`${results.length} component(s) were untagged:\n`);
    const components = results.map((result) => {
      return `${chalk.cyan(result.id.toStringWithoutVersion())}. version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n');
  }
}
