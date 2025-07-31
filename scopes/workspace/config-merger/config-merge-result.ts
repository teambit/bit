import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { compact } from 'lodash';
import type { MergeStrategyResult, GenericConfigOrRemoved } from './component-config-merger';
import { conflictIndicator } from './component-config-merger';

const DEP_RESOLVER_VERSION_INDENTATION = 8;
const CONFLICT_MARKER_INDENTATION = 7;

export class ConfigMergeResult {
  constructor(
    readonly compIdStr: string,
    private currentLabel: string,
    private otherLabel: string,
    private results: MergeStrategyResult[]
  ) {}
  hasConflicts(): boolean {
    return this.results.some((result) => result.conflict);
  }
  generateMergeConflictFile(): string | null {
    const resultsWithConflict = this.results.filter((result) => result.conflict);
    if (!resultsWithConflict.length) return null;
    const allConflicts = compact(resultsWithConflict.map((result) => this.generateConflictStringPerAspect(result)));
    const configMergeFormatted = allConflicts.map((c) => this.formatConflict(c));
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

  getDepsResolverResult(): MergeStrategyResult | undefined {
    return this.results.find((result) => result.id === DependencyResolverAspect.id);
  }

  private generateConflictStringPerAspect(result: MergeStrategyResult): string | undefined {
    if (!result.conflict) return undefined;
    if (result.id === DependencyResolverAspect.id) {
      return this.depsResolverConfigGenerator(result.conflict);
    }
    return this.basicConflictGenerator(result.id, result.conflict);
  }

  private depsResolverConfigGenerator(conflict: Record<string, any>): string {
    const mergedConfigSplit = JSON.stringify({ policy: conflict }, undefined, 2).split('\n');
    const conflictLines = mergedConfigSplit.map((line) => {
      if (!line.includes(conflictIndicator)) return line;
      const { currentVal, otherVal } = parseVersionLineWithConflict(line);
      return `${'<'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.currentLabel}
${' '.repeat(DEP_RESOLVER_VERSION_INDENTATION)}"version": "${currentVal}",
=======
${' '.repeat(DEP_RESOLVER_VERSION_INDENTATION)}"version": "${otherVal}",
${'>'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.otherLabel}`;
    });
    // replace the first line with line with the id
    conflictLines.shift();
    conflictLines.unshift(`"${DependencyResolverAspect.id}": {`);
    return conflictLines.join('\n');
  }

  private basicConflictGenerator(id: string, conflictObj: Record<string, any>): string {
    const { currentConfig, otherConfig } = conflictObj;
    let conflict: string;
    if (currentConfig === '-') {
      conflict = `${'<'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.currentLabel}
"${id}": "-"
=======
"${id}": ${JSON.stringify(otherConfig, undefined, 2)}
${'>'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.otherLabel}`;
    } else if (otherConfig === '-') {
      conflict = `${'<'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.currentLabel}
"${id}": ${JSON.stringify(currentConfig, undefined, 2)}
=======
"${id}": "-"
${'>'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.otherLabel}`;
    } else {
      const formatConfig = (conf: GenericConfigOrRemoved) => {
        const confStr = JSON.stringify(conf, undefined, 2);
        const confStrSplit = confStr.split('\n');
        confStrSplit.shift(); // remove first {
        confStrSplit.pop(); // remove last }
        return confStrSplit.join('\n');
      };
      conflict = `"${id}": {
${'<'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.currentLabel}
${formatConfig(currentConfig)}
=======
${formatConfig(otherConfig)}
${'>'.repeat(CONFLICT_MARKER_INDENTATION)} ${this.otherLabel}
}`;
    }

    return conflict;
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

export function parseVersionLineWithConflict(line: string) {
  const [, currentVal, otherVal] = line.split('::');
  return { currentVal, otherVal };
}
