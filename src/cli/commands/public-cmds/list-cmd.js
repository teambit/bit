/** @flow */
import R from 'ramda';
import chalk from 'chalk';
import Command from '../../command';
import { listScope } from '../../../api/consumer';
import listTemplate from '../../templates/list-template';
import bareListTemplate from '../../templates/bare-list-template';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import type { ListScopeResult } from '../../../consumer/component/components-list';
import hasWildcard from '../../../utils/string/has-wildcard';

export default class List extends Command {
  name = 'list [scope]';
  description = `list components on a local or a remote scope.\n  https://${BASE_DOCS_DOMAIN}/docs/cli-link.html`;
  alias = 'ls';
  opts = [
    ['ids', 'ids', 'show only component ids unformatted'],
    ['s', 'scope', 'show all components of the scope, including indirect dependencies'],
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
      scope = false,
      bare = false,
      json = false,
      outdated = false
    }: { ids?: boolean, scope?: boolean, bare?: boolean, json?: boolean, outdated?: boolean }
  ): Promise<any> {
    const params = { scopeName, showAll: scope, showRemoteVersion: outdated };
    if (hasWildcard(scopeName) && scopeName.includes('/')) {
      const scopeNameSplit = scopeName.split('/');
      params.scopeName = R.head(scopeNameSplit);
      params.namespacesUsingWildcards = R.tail(scopeNameSplit).join('/');
    }
    return listScope(params).then(listScopeResults => ({
      listScopeResults,
      scope: scopeName,
      ids,
      bare,
      json,
      outdated
    }));
  }

  report({
    listScopeResults,
    scope,
    ids,
    bare,
    json,
    outdated
  }: {
    listScopeResults: ListScopeResult[],
    scope: ?string,
    ids?: boolean,
    bare?: boolean,
    json?: boolean,
    outdated?: boolean
  }): string {
    function decideHeaderSentence() {
      if (json) return '';
      if (!scope) return `found ${listScopeResults.length} components in local scope\n`;
      return chalk.white(`found ${listScopeResults.length} components in ${chalk.bold(scope)}\n`);
    }

    if (R.isEmpty(listScopeResults)) {
      return chalk.white(json ? '[]' : `${decideHeaderSentence()}`);
    }

    if (ids) return JSON.stringify(listScopeResults.map(result => result.id.toString()));
    // TODO - use a cheaper list for ids flag (do not fetch versions at all) @!IMPORTANT
    return (
      decideHeaderSentence() +
      (bare ? bareListTemplate(listScopeResults) : listTemplate(listScopeResults, json, outdated))
    );
  }
}
