import type { BuildOptions } from './version-history-cmd';
import type { VersionHistoryMain } from './version-history.main.runtime';

export class BuildVersionHistoryAction {
  name = BuildVersionHistoryAction.name;
  constructor(private versionHistory: VersionHistoryMain) {}
  async execute(options: BuildOptions) {
    if (!options.pattern) throw new Error('BuildVersionHistoryAction: pattern is required');
    return this.versionHistory.buildByPattern(options.pattern, options);
  }
}
