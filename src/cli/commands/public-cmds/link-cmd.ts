import { link } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { CodemodResult } from '../../../consumer/component-ops/codemod-components';
import { LinksResult } from '../../../links/node-modules-linker';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import { codemodTemplate } from '../../templates/codemod-template';
import linkTemplate from '../../templates/link-template';

export default class Link implements LegacyCommand {
  name = 'link [ids...]';
  shortDescription = 'Generate symlinks for imported components absolute path resolution.';
  group: Group = 'collaborate';
  description = `generate symlinks to resolve module paths for imported components.\n  https://${BASE_DOCS_DOMAIN}/docs/dependencies#missing-links`;
  alias = 'b';
  opts = [
    ['j', 'json', 'return the output as JSON'],
    ['r', 'rewire', 'EXPERIMENTAL. Replace relative paths with module paths in code (e.g. "../foo" => "@bit/foo")'],
  ] as CommandOptions;
  private = false;
  loader = true;

  action([ids]: [string[]], { rewire = false }: { rewire: boolean }): Promise<any> {
    return link(ids, rewire);
  }

  report(
    results: { linksResults: LinksResult[]; codemodResults?: CodemodResult[] },
    _args: any,
    flags: Record<string, any>
  ): string {
    if (flags.json) {
      return JSON.stringify(results, null, 2);
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const linksResultsStr = linkTemplate(results.linksResults);
    const rewireResults = results.codemodResults ? `\n\n${codemodTemplate(results.codemodResults)}` : '';

    return linksResultsStr + rewireResults;
  }
}
