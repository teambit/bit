/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { listInline, listScope } from '../../../api/consumer';
import Component from '../../../consumer/component';
import { paintHeader } from '../../chalk-box';
import listTemplate from '../../templates/list-template';

export default class List extends Command {
  name = 'list [scope]';
  description = 'list all scope components';
  alias = 'ls';
  opts = [
    ['i', 'inline', 'in inline components'],
    ['ids', 'ids', 'in inline components']
  ];
  loader = true;

  action([scopeName]: string[], { inline, ids }: { inline: ?bool, ids: ?bool }): Promise<any> {
    function list() {
      if (inline) return listInline();
      return listScope({ scopeName });
    }

    return list()
    .then(components => ({
      components,
      scope: scopeName,
      inline,
      ids,
    }));
  }

  report({ components, scope, inline, ids }: {
    components: Component[],
    scope: ?string,
    inline: ?bool,
    ids: ?bool,
  }): string {
    function decideHeaderSentence() {
      if (inline) return `Total ${components.length} components in inline directory`;
      if (!scope) return `Total ${components.length} components in local scope`;
      return `Total ${components.length} components in ${scope}`;
    }

    if (R.isEmpty(components)) { return chalk.white(`${decideHeaderSentence()}`); }
    if (ids) return JSON.stringify(components.map(c => c.id.toString())); 
    // TODO - use a cheaper list for ids flag (do not fetch versions at all) @!IMPORTANT
    return paintHeader(decideHeaderSentence()) + listTemplate(components);
  }
}
