import { Box, Text } from 'ink';
import React from 'react';

import { UIServer } from '../ui-server';

export type UIServerConsoleProps = {
  uiServer: UIServer;
};

export function UIServerConsole({ uiServer }: UIServerConsoleProps) {
  return (
    <Box>
      <Text>Bit UI server is listening to port {uiServer.port}</Text>
    </Box>
  );
}
