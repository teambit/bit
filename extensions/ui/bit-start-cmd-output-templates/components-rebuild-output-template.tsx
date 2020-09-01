import { Box } from 'ink';
import React from 'react';

export const ComponentsRebuildOutput = (workspace: string, components: [any], envs: [any]) => {
  return (
    <Box>
      Compiling ${components.length} using ${envs.length} environments in workspace ${workspace}
      STATUS COMPONENT ID
      {components.map(
        (component) => `${component.status === 'FAIL' ? '✗' : '✓'} ${component.status}        ${component.id}`
      )}
    </Box>
  );
};
