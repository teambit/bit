/** @flow */
import Command from '../../command';
import { unTagAction } from '../../../api/consumer';
import type { untagResult } from '../../../scope/component-ops/untag-component';

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

  action([id, version]: string[], { all, force }: { all: ?boolean, force: ?boolean }): Promise<untagResult[]> {
    if (!id && !all) {
      throw new Error('please specify a component ID or use --all flag');
    }

    if (all) {
      version = id;
      return unTagAction(version, force);
    }
    return unTagAction(version, force, id);
  }

  report(results: untagResult[]): string {
    const title = chalk.green(`${results.length} component(s) were untagged:\n`);
    const components = results.map((result) => {
      return `${chalk.cyan(result.id.toStringWithoutVersion())}. version(s): ${result.versions.join(', ')}`;
    });
    return title + components.join('\n');
  }
}
