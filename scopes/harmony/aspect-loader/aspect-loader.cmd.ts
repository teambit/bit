import { AspectLoaderMain } from '@teambit/aspect-loader';
import { Command, CommandOptions } from '@teambit/cli';
import { CLITable } from '@teambit/cli-table';

export class PluginsCmd implements Command {
  name = 'plugins';
  alias = 'plugin';
  description = 'Manage and retrieve information about plugins';
  shortDescription = 'Manage and retrieve information about plugins';
  group = 'development';

  options = [['p', 'patterns', 'Retrieve patterns used by plugins']] as CommandOptions;

  constructor(private aspectLoader: AspectLoaderMain) {}

  async report(args: any, { patterns }: { patterns?: boolean }): Promise<string> {
    if (patterns) {
      return this.getPatternsTable();
    }
    return 'Usage:\n  bit plugins --patterns\n';
  }

  private getPatternsTable(): string {
    const patterns = this.aspectLoader.getPluginDefsPatterns();
    const header = [{ value: 'patterns' }];
    const tableData = patterns.map((pattern) => ({ patterns: pattern }));
    const table = CLITable.fromObject(header, tableData as unknown as Record<string, string>[]);
    return table.render();
  }
}
