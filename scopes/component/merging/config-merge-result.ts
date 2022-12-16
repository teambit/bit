import { MergeStrategyResult } from './config-merger';

export class ConfigMergeResult {
  constructor(readonly compIdStr: string, private results: MergeStrategyResult[]) {}
  hasConflicts(): boolean {
    return this.results.some((result) => result.conflict);
  }
  generateMergeConflictFile(): string | null {
    const resultsWithConflict = this.results.filter((result) => result.conflict);
    if (!resultsWithConflict.length) return null;
    const configMergeAspects = resultsWithConflict.map((result) => result.conflict);
    const conflictStr = `{
  ${configMergeAspects.join(',\n')}
}
`;
    return this.formatConflict(conflictStr);
  }
  getSuccessfullyMergedConfig(): Record<string, any> {
    const resultsWithMergedConfig = this.results.filter((result) => result.mergedConfig);
    return resultsWithMergedConfig.reduce((acc, curr) => {
      const currObject = { [curr.id]: curr.mergedConfig };
      return { ...acc, ...currObject };
    }, {});
  }

  private formatConflict(conflict: string) {
    return (
      conflict
        .split('\n')
        // remove the white spaces before the conflict indicators
        .map((line) => line.replace(/ *(<<<<<<<|>>>>>>>|=======)/g, '$1'))
        .join('\n')
    );
  }
}
