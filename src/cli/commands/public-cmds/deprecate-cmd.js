/** @flow */
import { deprecate } from '../../../api/consumer';
import Remove from './remove-cmd';

export default class Deprecate extends Remove {
  name = 'deprecate <ids...>';
  description = 'deprevate a bit';
  alias = 'd';
  opts = [['r', 'remote [boolean]', 'remove from remote scope']];

  action([ids]: [string], { remote = false }: { remote: Boolean }): Promise<any> {
    return deprecate({ ids, remote });
  }
}
