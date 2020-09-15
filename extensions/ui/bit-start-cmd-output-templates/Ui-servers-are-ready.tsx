import React from 'react';
import { Text, Color, Box } from 'ink';

export const UIServersAreReady = ({ host, port, timestamp, workspace }) => (
  <>
    <Box>
      <Text>You can now view {workspace.id} components in the browser.</Text>
    </Box>
    <Box>
      <Text>
        {`Main UI server is running, running on http://${host}:${port} `} <Color yellow>{timestamp}</Color>
      </Text>
    </Box>
    <Box>{`\n`}</Box>
    <Box>
      <Text>
        {`Waiting for component changes (${timestamp})... `} <Color yellow>{Date.now().toString()}</Color>
      </Text>
    </Box>
  </>
);
