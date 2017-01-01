/** @flow */
import Command from '../../command';

export default class RemoteRm extends Command {
  name = 'remove <url>';
  description = 'remove a tracked bit remote';
  alias = 'rm';
  opts = [
    ['g', 'global', 'remove a global configured remote scope']
  ];
  
  action([url, ]: [string, ]): Promise<any> {
    return Promise.resolve(url);
  }

  report(data: {string: any}): string {
    return data;
  }
}
