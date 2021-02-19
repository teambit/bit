import { Text } from 'ink';
import React from 'react';
import { CodemodResult } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';

type RewireRowProps = {
  legacyCodemodResults?: CodemodResult[];
};
export function RewireRow({ legacyCodemodResults }: RewireRowProps) {
  if (!legacyCodemodResults || legacyCodemodResults.length < 1) return null;
  const totalComps = legacyCodemodResults?.length;
  const totalFiles = legacyCodemodResults.reduce((acc, curr) => {
    return acc + curr.changedFiles.length || 0;
  }, 0);

  return (
    <Text>
      rewired <Text color="cyan">{totalComps}</Text> components and total of <Text color="cyan">{totalFiles}</Text>{' '}
      files
    </Text>
  );
}
