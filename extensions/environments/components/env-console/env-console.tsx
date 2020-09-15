// eslint-disable-next-line @typescript-eslint/no-unused-vars
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { EnvRuntime } from '../../runtime';

export type EnvConsoleProps = {
  runtime: EnvRuntime;
};

export function EnvConsole() {
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCounter((previousCounter) => previousCounter + 1);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Box>
      <Text color="green">{counter} tests passed</Text>
    </Box>
  );
}
