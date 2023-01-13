import { compact } from 'lodash';
import { MergeStrategyResult } from './config-merger';

export class ConfigMergeResult {
  constructor(readonly compIdStr: string, private results: MergeStrategyResult[]) {}
  hasConflicts(): boolean {
    return this.results.some((result) => result.conflict);
  }
  generateMergeConflictFile(): string | null {
    const resultsWithConflict = this.results.filter((result) => result.conflict);
    if (!resultsWithConflict.length) return null;
    const configMergeAspects = compact(resultsWithConflict.map((result) => result.conflict));
    const configMergeFormatted = configMergeAspects.map((c) => this.formatConflict(c));
    const conflictStr = `{
${this.concatenateConflicts(configMergeFormatted)}
}`;
    return conflictStr;
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
        // add 2 spaces before each line
        .map((line) => `  ${line}`)
        // remove the white spaces before the conflict indicators
        .map((line) => line.replace(/ *(<<<<<<<|>>>>>>>|=======)/g, '$1'))
        .join('\n')
    );
  }

  private concatenateConflicts(conflicts: string[]) {
    const conflictsWithComma = conflicts.map((conflict, index) => {
      if (index === conflicts.length - 1) return conflict; // last element in the array, no need to add a comma
      if (conflict.endsWith('}')) return `${conflict},`; // ends normally with a closing brace, add a comma.
      // if it doesn't end with a closing brace, it means it ends with a conflict indicator.
      // the comma should be added after the last line with a closing brace.
      const conflictSplit = conflict.split('\n');
      // find the last line with '}' and add a comma after it
      const lastLineWithClosingBrace = conflictSplit.lastIndexOf('  }');
      conflictSplit[lastLineWithClosingBrace] += ',';
      return conflictSplit.join('\n');
    });
    return conflictsWithComma.join('\n');
  }
}
