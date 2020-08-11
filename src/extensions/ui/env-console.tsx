import React from 'react';
import { Box } from 'ink';
import { UIServer } from './ui-server';

export type UIServerConsoleProps = {
  uiServer: UIServer;
};

export function UIServerConsole({ uiServer }: UIServerConsoleProps) {
  return <Box>Bit UI server is listening to port {uiServer.port}</Box>;
}
