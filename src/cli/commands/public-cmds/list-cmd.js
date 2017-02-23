/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { listInline, listScope } from '../../../api/consumer';
import Component from '../../../consumer/component';
import { paintHeader } from '../../chalk-box';
import listTemplate from '../../templates/list-template';
import bareListTemplate from '../../templates/bare-list-template';

export default class List extends Command {
  name = 'list [scope]';
  description = 'list all scope components';
  alias = 'ls';
  opts = [
    ['i', 'inline', 'in inline components'],
    ['ids', 'ids', 'in inline components'],
    ['c', 'cache', 'also show cached components in scope (works for local scopes)'],
    ['b', 'bare', 'show bare output (more details, less pretty)'],
  ];
  loader = true;

  action([scopeName]: string[], { inline, ids, cache, bare }: {
    inline?: bool, ids?: bool, cache?: bool, bare?: bool }): Promise<any> {
    function list() {
      if (inline) return listInline();
      return listScope({ scopeName, cache });
    }

    return list()
    .then(components => ({
      components,
      scope: scopeName,
      inline,
      ids,
      bare,
    }));
  }

  report({ components, scope, inline, ids, bare }: {
    components: Component[],
    scope: ?string,
    inline?: bool,
    ids?: bool,
    bare?: bool,
  }): string {
    function decideHeaderSentence() {
      if (inline) return `Total ${components.length} components in inline directory`;
      if (!scope) return `Total ${components.length} components in local scope`;
      return `Total ${components.length} components in ${scope}`;
    }

    if (R.isEmpty(components)) { return chalk.white(`${decideHeaderSentence()}`); }
    if (ids) return JSON.stringify(components.map(c => c.id.toString())); 
    // TODO - use a cheaper list for ids flag (do not fetch versions at all) @!IMPORTANT
    return paintHeader(decideHeaderSentence()) + 
    (bare ? bareListTemplate(components) : listTemplate(components));
  }
}
