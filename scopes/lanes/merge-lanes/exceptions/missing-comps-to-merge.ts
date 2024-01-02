import { BitError } from '@teambit/bit-error';

export class MissingCompsToMerge extends BitError {
  constructor(missingDepsFromHead: { [depId: string]: string[] }, missingDepsFromHistory: string[]) {
    const getMissingHeadDepsStr = () => {
      if (!Object.keys(missingDepsFromHead).length) return '';
      const title = 'The following are missing dependencies from the head version:';
      const missingDepsStr = Object.keys(missingDepsFromHead).map((dep) => {
        const originComps = missingDepsFromHead[dep];
        return `${dep} => (dependency of: ${originComps.map((d) => d.toString()).join(', ')})`;
      });
      return `${title}\n${missingDepsStr.join('\n')}`;
    };
    const getMissingHistoryDepsStr = () => {
      if (!missingDepsFromHistory.length) return '';
      const title =
        'The following are dependencies from previous versions, which you can avoid merging by using --squash flag:';
      return `\n${title}\n${missingDepsFromHistory.join('\n')}`;
    };

    super(`Failed to merge the lane partially as some components have dependencies which were not included.
consider adding "--include-deps" flag to include them.

${getMissingHeadDepsStr()}
${getMissingHistoryDepsStr()}`);
  }
}
