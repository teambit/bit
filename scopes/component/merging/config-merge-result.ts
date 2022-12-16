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
    return `{
  ${configMergeAspects.join(',\n')}
}
`;
  }
  getSuccessfullyMergedConfig(): Record<string, any> {
    const resultsWithMergedConfig = this.results.filter((result) => result.mergedConfig);
    return resultsWithMergedConfig.reduce((acc, curr) => {
      const currObject = { [curr.id]: curr.mergedConfig };
      return { ...acc, ...currObject };
    }, {});
  }
}
