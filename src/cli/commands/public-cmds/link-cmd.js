/** @flow */
import chalk from 'chalk';
import Command from '../../command';
import { link } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';

export default class Create extends Command {
  name = 'link';
  description = 'generate symlinks for sourced components absolute path resolution.\n  https://docs.bitsrc.io/docs/cli-link.html';
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
