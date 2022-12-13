import { MergeStrategyResult } from './config-merger';

export class ConfigMergeResult {
  constructor(private results: MergeStrategyResult[]) {}
  hasConflicts(): boolean {
    return this.results.some((result) => result.conflict);
  }
  generateConfigMergeFile(): string | null {
    const relevantAspects = this.results.filter((result) => result.conflict || result.isMerged);
    if (!relevantAspects.length) return null;
    const configMergeAspects = relevantAspects.map((result) => {
      const { id, config, conflict } = result;
      if (conflict) return conflict;
      return JSON.stringify({ [id]: config }, null, 2);
    });
    return `{
  ${configMergeAspects.join(',\n')}
}
`;
  }
}
