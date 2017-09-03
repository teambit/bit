/** @flow */
import chalk from 'chalk';
import path from 'path';
import Command from '../../command';
import { untrack } from '../../../api/consumer';

export default class Untrack extends Command {
  name = 'untrack <files...>';
  description = 'untrack new components/files';
  alias = 'u';
  opts = [];
  loader = true;

  action([components]: [string[]]):Promise<*> {
    return untrack(components);
  }

  report(results):string {
    console.log(results);
  }
}
