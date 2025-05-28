import { Command, CommandOptions } from '@teambit/cli';
import { isEmpty } from 'lodash';
import chalk from 'chalk';
import { hasWildcard } from '@teambit/legacy.utils';
import { listTemplate } from './list-template';
import { ListerMain, ListScopeResult } from './lister.main.runtime';

type ListFlags = {
  ids?: boolean;
  localScope?: boolean; // whether show all components in the local scope (including indirect dependencies)
  scope?: string; // new flag for filtering by scope name
  json?: boolean;
  outdated?: boolean;
  namespace?: string;
  includeDeleted?: boolean;
};

export class ListCmd implements Command {
  name = 'list [remote-scope]';
  description = 'list components on a workspace or a remote scope (with flag).';
  group = 'info-analysis';
  helpUrl = 'reference/reference/cli-reference#list';
  alias = 'ls';
  options = [
    ['i', 'ids', 'show only component ids, unformatted'],
    ['l', 'local-scope', 'show only components stored in the local scope, including indirect dependencies'],
    ['s', 'scope <string>', 'filter components by their scope name (e.g., teambit.workspace)'],
    ['o', 'outdated', 'highlight outdated components, in comparison with their latest remote version (if one exists)'],
    ['d', 'include-deleted', 'EXPERIMENTAL. show also deleted components'],
    ['j', 'json', 'show the output in JSON format'],
    [
      'n',
      'namespace <string>',
      "filter components by their namespace (a logical grouping within a scope, e.g., 'ui', '*/ui')",
    ],
  ] as CommandOptions;
  loader = true;
  skipWorkspace = true;
  remoteOp = true;

  constructor(private lister: ListerMain) {}

  async report([scopeName]: string[], listFlags: ListFlags) {
    if (scopeName && (listFlags.localScope || listFlags.scope)) {
      throw new Error('The --local-scope and --scope flags cannot be used when listing a remote scope.');
    }
    const listScopeResults = await this.getListResults(scopeName, listFlags);

    const { ids, outdated = false } = listFlags;

    function decideHeaderSentence() {
      if (!scopeName) return `found ${listScopeResults.length} components\n`;
      return chalk.white(`found ${listScopeResults.length} components in ${chalk.bold(scopeName)}\n`);
    }

    if (isEmpty(listScopeResults)) {
      return chalk.white(decideHeaderSentence());
    }

    if (ids) return JSON.stringify(listScopeResults.map((result) => result.id.toString()));
    // TODO - use a cheaper list for ids flag (do not fetch versions at all) @!IMPORTANT
    return decideHeaderSentence() + listTemplate(listScopeResults, false, outdated);
  }

  async json([scopeName]: string[], listFlags: ListFlags) {
    if (scopeName && (listFlags.localScope || listFlags.scope)) {
      throw new Error('The --local-scope and --scope flags cannot be used when listing a remote scope.');
    }
    const listScopeResults = await this.getListResults(scopeName, listFlags);

    if (isEmpty(listScopeResults)) {
      return [];
    }

    const { ids, outdated = false } = listFlags;
    if (ids) return listScopeResults.map((result) => result.id.toString());
    return listTemplate(listScopeResults, true, outdated) as Record<string, any>;
  }

  private async getListResults(
    scopeName?: string,
    { namespace, localScope, scope, outdated, includeDeleted }: ListFlags = {}
  ): Promise<ListScopeResult[]> {
    const getNamespaceWithWildcard = () => {
      if (!namespace) return undefined;
      if (hasWildcard(namespace)) return namespace;
      return `${namespace}/*`;
    };
    const namespacesUsingWildcards = getNamespaceWithWildcard();

    return scopeName
      ? this.lister.remoteList(scopeName, { namespacesUsingWildcards, includeDeleted })
      : this.lister.localList(localScope, outdated, namespacesUsingWildcards, scope);
  }
}
