import chalk from 'chalk';
import Command, { CommandOptions } from '../../command';
import { move } from '../../../api/consumer';
import { PathChangeResult } from '../../../consumer/bit-map/bit-map';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Move extends Command {
  name = 'move <from> <to>';
  description = `move files or directories of component(s)\n  https://${BASE_DOCS_DOMAIN}/docs/add-and-isolate-components#moving-and-renaming-files`;
  alias = 'mv';
  opts = [
    ['c', 'component', 'move component files that are spread over multiple directories to one directory']
  ] as CommandOptions;
  loader = true;

  action([from, to]: [string, string], { component = false }: { component: boolean }): Promise<any> {
    return move({ from, to, component });
  }

  report(componentsChanged: PathChangeResult[]): string {
    const output = componentsChanged.map(component => {
      const title = chalk.green(`moved component ${component.id.toString()}:\n`);
      const files = component.changes.map(file => `from ${chalk.bold(file.from)} to ${chalk.bold(file.to)}`).join('\n');
      return title + files;
    });
    return output.join('\n');
  }
}
