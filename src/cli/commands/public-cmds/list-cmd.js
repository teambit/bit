/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { listInline, listScope } from '../../../api/consumer';
import Component from '../../../consumer/component';
import { paintHeader, listToTable } from '../../chalk-box';

export default class List extends Command {
  name = 'list [scope]';
  description = 'list all scope components';
  alias = 'ls';
  opts = [
    ['i', 'inline', 'in inline components']
  ];
  loader = { autoStart: false, text: 'listing remote components' };

  action([scopeName]: string[], { inline }: { inline: ?bool }): Promise<any> {
    const loader = this.loader;

    function list() {
      if (inline) return listInline();
      return listScope({ scopeName, loader });
    }

    return list()
    .then(components => ({
      components,
      scope: scopeName,
      inline
    }));
  }

  report({ components, scope, inline }: {
    components: Component[],
    scope: ?string,
    inline: ?bool
  }): string {
    function decideHeaderSentence() {
      if (inline) return `Total ${components.length} components in inline directory`;
      if (!scope) return `Total ${components.length} components in local scope`;
      return `Total ${components.length} components in ${scope}`;
    }

    if (R.isEmpty(components)) {
      return chalk.white(`${decideHeaderSentence()}`);  
    }
    
    return paintHeader(decideHeaderSentence()) + listToTable(components);
  }

}
