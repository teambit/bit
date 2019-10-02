/** @flow */
import Command from '../../command';
import { link } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Create extends Command {
  name = 'link';
  description = `generate symlinks for sourced components absolute path resolution.\n  https://${BASE_DOCS_DOMAIN}/docs/cli-link.html`;
  alias = 'b';
  opts = [];
  private = false;
  loader = true;

  action(): Promise<*> {
    return link();
  }

  report(results: Array<{ id: string, bound: ?Object }>): string {
    return linkTemplate(results);
  }
}
