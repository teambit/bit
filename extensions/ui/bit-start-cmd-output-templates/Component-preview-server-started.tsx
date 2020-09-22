import React from 'react';
import { Box, Text } from 'ink';

export const ComponentPreviewServerStarted = ({ envName, host, port, timestamp }) => (
  <Box>
    <Box width="30%">
      <Text color="rgb(45, 164, 157)">{envName}</Text>
    </Box>
    <Box width="50%">
      <Text>{`Component Preview Server Started on http://${host}:${port} `}</Text>
    </Box>
    <Box width="20%">
      <Text color="yellow">{timestamp}</Text>
    </Box>
  </Box>
);
