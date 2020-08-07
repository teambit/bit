import React, { useState, useEffect } from 'react';
import { Box } from 'ink';
import { UIServer } from './ui-server';

export type UIServerConsoleProps = {
  uiServer: UIServer;
};

export function UIServerConsole({ uiServer }: UIServerConsoleProps) {
  const [, setCounter] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCounter((previousCounter) => previousCounter + 1);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return <Box>Bit UI server is listening to port {uiServer.port}</Box>;
}
