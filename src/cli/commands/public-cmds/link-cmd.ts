import Command from '../../command';
import { link } from '../../../api/consumer';
import linkTemplate from '../../templates/link-template';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import { LinksResult } from '../../../links/node-modules-linker';
import { CodemodResult } from '../../../consumer/component-ops/codemod-components';
import { codemodTemplate } from '../../templates/codemod-template';

export default class Link extends Command {
  name = 'link';
  description = `generate symlinks for sourced components absolute path resolution.\n  https://${BASE_DOCS_DOMAIN}/docs/dependencies#missing-links`;
  alias = 'b';
  // @ts-ignore
  opts = [
    [
      'r',
      'rewire',
      'EXPERIMENTAL. change source code, replace relative paths with module paths (e.g. "../foo" => "@bit/foo")'
    ]
  ];
  private = false;
  loader = true;

  action(args: string[], { rewire = false }: { rewire: boolean }): Promise<any> {
    return link(rewire);
  }

  report(results: { linksResults: LinksResult[]; codemodResults?: CodemodResult[] }): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const linksResultsStr = linkTemplate(results.linksResults);
    const rewireResults = results.codemodResults ? `\n\n${codemodTemplate(results.codemodResults)}` : '';

    return linksResultsStr + rewireResults;
  }
}
