/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { listScope } from '../../../api/consumer';
import Component from '../../../consumer/component';
import { paintHeader } from '../../chalk-box';
import listTemplate from '../../templates/list-template';
import bareListTemplate from '../../templates/bare-list-template';

export default class List extends Command {
  name = 'list [scope]';
  description = 'list components on a local or a remote scope.';
  alias = 'ls';
  opts = [
    ['ids', 'ids', 'components ids to list'],
    ['b', 'bare', 'show bare output (more details, less pretty)'],
    ['o', 'outdated', 'show latest versions from remotes'],
    ['j', 'json', 'show the output in JSON format']
  ];
  loader = true;
  migration = true;

  action(
    [scopeName]: string[],
    {
      ids,
      bare,
      json,
      outdated
    }: { ids?: boolean, cache?: boolean, bare?: boolean, json?: boolean, outdated?: boolean }
  ): Promise<any> {
    return listScope({ scopeName, cache: true, showRemoteVersion: outdated }).then(components => ({
      components,
      scope: scopeName,
      ids,
      bare,
      json,
      outdated
    }));
  }

  report({
    components,
    scope,
    ids,
    bare,
    json,
    outdated
  }: {
    components: Component[],
    scope: ?string,
    ids?: boolean,
    bare?: boolean,
    json?: boolean,
    outdated?: boolean
  }): string {
    function decideHeaderSentence() {
      if (json) return '';
      if (!scope) return `found ${components.length} components in local scope\n`;
      return chalk.white(`found ${components.length} components in ${chalk.bold(scope)}\n`);
    }

    if (R.isEmpty(components)) {
      return chalk.white(`${decideHeaderSentence()}`);
    }

    if (ids) return JSON.stringify(components.map(c => c.id.toString()));
    // TODO - use a cheaper list for ids flag (do not fetch versions at all) @!IMPORTANT
    return decideHeaderSentence() + (bare ? bareListTemplate(components) : listTemplate(components, json, outdated));
  }
}
