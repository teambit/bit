import type { Command, CommandOptions } from '@teambit/cli';
import { formatTitle, formatHint, formatWarningSummary, joinSections } from '@teambit/cli';
import type { ListerMain, SearchResults } from './lister.main.runtime';

type SearchFlags = {
  owners?: string;
  skipAutoOwner?: boolean;
  remoteOnly?: boolean;
  localOnly?: boolean;
  json?: boolean;
};

export class SearchCmd implements Command {
  name = 'search <query...>';
  description = 'search for components by keyword in the local workspace and remote bit cloud';
  extendedDescription = `runs the provided query terms in parallel against bit cloud and against the local workspace.
multiple queries are unioned (deduplicated) in the output. by default, remote results are filtered by the
owner extracted from the workspace's defaultScope; use --owners or --skip-auto-owner to change this.`;
  group = 'info-analysis';
  options = [
    ['o', 'owners <list>', 'comma-separated list of owners/orgs to filter remote results by'],
    ['', 'skip-auto-owner', 'do not auto-extract owner from workspace defaultScope'],
    ['r', 'remote-only', 'only search remote bit cloud, skip local workspace'],
    ['l', 'local-only', 'only search the local workspace, skip remote bit cloud'],
    ['j', 'json', 'show the output in JSON format'],
  ] as CommandOptions;
  loader = true;
  skipWorkspace = true;
  remoteOp = true;

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

    if (results.ownersUsed?.length && !flags.localOnly) {
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
