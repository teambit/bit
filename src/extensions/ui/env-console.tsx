import React, { useState, useEffect } from 'react';
import { Box } from 'ink';

export function EnvConsole(props: any) {
  const [, setCounter] = useState(0);
  props;
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
      {/* {runtime.runtimeEnvs.map((def, key) => (
        <Box key={key}>
          <Color cyan>starting development environment: {def.id}...</Color>
        </Box>
      ))} */}
    </Box>
  );
}
