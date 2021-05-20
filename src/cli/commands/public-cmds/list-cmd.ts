import chalk from 'chalk';
import R from 'ramda';

import { listScope } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { ListScopeResult } from '../../../consumer/component/components-list';
import hasWildcard from '../../../utils/string/has-wildcard';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import bareListTemplate from '../../templates/bare-list-template';
import listTemplate from '../../templates/list-template';

export default class List implements LegacyCommand {
  name = 'list [scope]';
  shortDescription = 'list components on a local or a remote scope.';
  group: Group = 'discover';
  description = `list components on a local or a remote scope.\n  https://${BASE_DOCS_DOMAIN}/docs/view#list`;
  alias = 'ls';
  opts = [
    ['ids', 'ids', 'show only component ids unformatted'],
    ['s', 'scope', 'show all components of the scope, including indirect dependencies'],
    ['b', 'bare', 'DEPRECATED. use --raw instead'],
    ['r', 'raw', 'show raw output (only components ids, no styling)'],
    ['o', 'outdated', 'show latest versions from remotes'],
    ['j', 'json', 'show the output in JSON format'],
    ['n', 'namespace <string>', 'show only specified namespace by using wildcards'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  skipWorkspace = true;
  remoteOp = true;

  action(
    [scopeName]: string[],
    {
      ids,
      scope = false,
      bare = false,
      raw = false,
      json = false,
      outdated = false,
      namespace,
    }: {
      ids?: boolean;
      scope?: boolean;
      bare?: boolean;
      raw?: boolean;
      json?: boolean;
      outdated?: boolean;
      namespace?: string;
    }
  ): Promise<any> {
    const params = { scopeName, showAll: scope, showRemoteVersion: outdated };
    if (bare) {
      console.warn(chalk.yellow('--bare flag is deprecated. please use --raw instead')); // eslint-disable-line no-console
      raw = true;
    }
    if (namespace) {
      const namespaceWithWildcard = hasWildcard(namespace) ? namespace : `${namespace}/*`;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      params.namespacesUsingWildcards = namespaceWithWildcard;
    }
    return listScope(params).then((listScopeResults) => ({
      listScopeResults,
      scope: scopeName,
      ids,
      raw,
      json,
      outdated,
    }));
  }

  report({
    listScopeResults,
    scope,
    ids,
    raw,
    json,
    outdated,
  }: {
    listScopeResults: ListScopeResult[];
    scope: string | null | undefined;
    ids?: boolean;
    raw?: boolean;
    json?: boolean;
    outdated?: boolean;
  }): string {
    function decideHeaderSentence() {
      if (json) return '';
      if (!scope) return `found ${listScopeResults.length} components in local scope\n`;
      return chalk.white(`found ${listScopeResults.length} components in ${chalk.bold(scope)}\n`);
    }

    if (R.isEmpty(listScopeResults)) {
      return chalk.white(json ? '[]' : `${decideHeaderSentence()}`);
    }

    if (ids) return JSON.stringify(listScopeResults.map((result) => result.id.toString()));
    // TODO - use a cheaper list for ids flag (do not fetch versions at all) @!IMPORTANT
    return (
      decideHeaderSentence() +
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      (raw ? bareListTemplate(listScopeResults) : listTemplate(listScopeResults, json, outdated))
    );
  }
}
