/** @flow */
import Command from '../../command';

export default class RemoteAdd extends Command {
  name = 'add <url>';
  description = 'add a tracked bit remote';
  alias = '';
  opts = [
    ['g', 'global', 'configure a remote bit scope']
  ];
  
  action([url, ]: [string, ]): Promise<any> {
    return Promise.resolve(url);
  }

  report(data: {string: any}): string {
    return data;
  }
}
