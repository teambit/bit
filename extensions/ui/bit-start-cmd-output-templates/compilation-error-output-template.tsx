import { Box } from 'ink';
import React from 'react';

export type props = {
  duration: string;
  components: [any];
};

export const CompilationErrorOutput = ({ duration, components }: props) => {
  const failedComponents = components.filter((cop) => cop.status === 'FAIL');
  return (
    <Box>
      Compilation finished ({duration}) Failed to compile {failedComponents.length} components out of{' '}
      {components.length} components STATUS COMPONENT ID
      {components.map(
        (component) => `${component.status === 'FAIL' ? '✗' : '✓'} ${component.status}        ${component.id}`
      )}
    </Box>
  );
};
