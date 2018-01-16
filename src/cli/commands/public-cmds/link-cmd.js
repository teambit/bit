/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { link } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';

export default class Create extends Command {
  name = 'link';
  description = 'Call the driver link action';
  alias = 'b';
  opts = [];
  private = true;
  loader = true;

  action(): Promise<*> {
    return link();
  }

  report(results: Array<{ id: string, bound: ?Object }>): string {
    return linkTemplate(results);
  }
}
