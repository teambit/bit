import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export type UIServerLoaderProps = {
  /**
   * name of the ui root.
   */
  name: string;
};

export function UIServerLoader({ name }: UIServerLoaderProps) {
  return (
    <Box paddingTop={1}>
      <Text>
        <Text color="green">
          <Spinner type="dots" />
        </Text>{' '}
        Starting development servers for '<Text color="cyan">{name}</Text>'
      </Text>
    </Box>
  );
}
