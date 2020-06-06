// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Color, Box } from 'ink';
import { EnvRuntime } from '../../runtime';

export type EnvConsoleProps = {
  runtime: EnvRuntime;
};

export function EnvConsole() {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCounter(previousCounter => previousCounter + 1);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Box>
      <Color green>{counter} tests passed</Color>
    </Box>
  );
}
