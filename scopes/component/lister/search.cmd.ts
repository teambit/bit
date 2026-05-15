import type { Command, CommandOptions } from '@teambit/cli';
import { formatTitle, formatHint, formatWarningSummary, joinSections } from '@teambit/cli';
import type { ListerMain, SearchResults } from './lister.main.runtime';
import { searchCommand } from './lister.commands';

type SearchFlags = {
  owners?: string;
  skipAutoOwner?: boolean;
  remoteOnly?: boolean;
  localOnly?: boolean;
  json?: boolean;
};

export class SearchCmd implements Command {
  name = searchCommand.name;
  description = searchCommand.description;
  extendedDescription = searchCommand.extendedDescription;
  group = searchCommand.group;
  options = searchCommand.options;
  loader = searchCommand.loader;
  skipWorkspace = searchCommand.skipWorkspace;
  remoteOp = searchCommand.remoteOp;

  constructor(private lister: ListerMain) {}

  private parseOwners(owners?: string): string[] | undefined {
    if (!owners) return undefined;
    return owners
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  private async run(queries: string[], flags: SearchFlags): Promise<SearchResults> {
    return this.lister.search(queries, {
      owners: this.parseOwners(flags.owners),
      skipAutoOwner: flags.skipAutoOwner,
      remoteOnly: flags.remoteOnly,
      localOnly: flags.localOnly,
    });
  }

  async report([queries]: [string[]], flags: SearchFlags) {
    const results = await this.run(queries, flags);
    const sections: string[] = [];

    if (results.ownersUsed?.length && !flags.localOnly && results.remoteAvailable !== false) {
      sections.push(formatHint(`remote search filtered by owners: ${results.ownersUsed.join(', ')}`));
    }

    if (!flags.remoteOnly && results.hasWorkspace) {
      const body = results.local.length ? results.local.join('\n') : formatHint('no matches in workspace');
      sections.push(`${formatTitle(`Local (${results.local.length})`)}\n${body}`);
    }

    if (!flags.localOnly) {
      if (results.remoteAvailable === false) {
        sections.push(formatHint('remote search unavailable (connection failed)'));
      } else {
        const body = results.remote.length ? results.remote.join('\n') : formatHint('no matches on bit cloud');
        sections.push(`${formatTitle(`Remote (${results.remote.length})`)}\n${body}`);
      }
    }

    const failed = results.perQuery.filter((r) => r.error);
    if (failed.length) {
      const items = failed.map((r) => `  - "${r.query}": ${r.error}`);
      sections.push(`${formatWarningSummary('Failed queries:')}\n${items.join('\n')}`);
    }

    return joinSections(sections);
  }

  async json([queries]: [string[]], flags: SearchFlags) {
    return this.run(queries, flags);
  }
}
