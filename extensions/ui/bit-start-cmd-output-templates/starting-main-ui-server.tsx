import React from 'react';
import { Text, Box } from 'ink';
import Spinner from 'ink-spinner';

export const StartingMainUiServer = ({ workspace }: any) => (
  <Box paddingTop={1}>
    <Text>
      <Text color="green">
        <Spinner type="dots" />
      </Text>{' '}
      Starting the main UI servers for {workspace.id}...
    </Text>
  </Box>
);
