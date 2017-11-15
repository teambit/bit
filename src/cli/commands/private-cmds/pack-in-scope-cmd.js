/** @flow */
import Command from '../../command';
import { pack } from '../../../api/scope';

export default class Pack extends Command {
  name = 'pack <id> [scopePath]';
  description = 'pack component';
  alias = '';
  opts = [
    ['d', 'directory <directory> ', 'path to store pack'],
    ['w', 'write_bit_dependencies [boolean] ', 'write bit components dependencies to package.json file'],
    ['l', 'links [boolean]', 'generate links according to repo'],
    ['o', 'override [boolean]', 'override existing pack file']
  ];
  private = true;

  action(
    [id, scopePath]: [string, ?string],
    {
      directory,
      write_bit_dependencies = false,
      links = false,
      override = false
    }: { directory: ?string, write_bit_dependencies: ?boolean, links: ?boolean, override: ?boolean }
  ): Promise<any> {
    return pack(id, scopePath || process.cwd(), directory, write_bit_dependencies, links, override);
  }

  report(pack: string): string {
    return pack;
  }
}
