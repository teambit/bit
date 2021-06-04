import { CodemodResult } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';
import chalk from 'chalk';

type RewireRowProps = {
  legacyCodemodResults?: CodemodResult[];
};
export function RewireRow({ legacyCodemodResults }: RewireRowProps) {
  if (!legacyCodemodResults || legacyCodemodResults.length < 1) return '';
  const totalComps = legacyCodemodResults?.length;
  const totalFiles = legacyCodemodResults.reduce((acc, curr) => {
    return acc + curr.changedFiles.length || 0;
  }, 0);

  return `rewired ${chalk.cyan(totalComps.toString())} components and total of ${chalk.cyan(
    totalFiles.toString()
  )} files\n`;
}
