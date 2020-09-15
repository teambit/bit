import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export const ComponentPreviewServerStarted = ({ envName, host, port, timestamp }) => (
  <Box>
    <Box width="30%">
      <Text color="redBright">{envName}</Text>
    </Box>
    <Box width="50%">{`Component Preview Server Started on http://${host}:${port} `}</Box>
    <Box width="20%">
      <Text color="yellow">{timestamp}</Text>
    </Box>
  </Box>
);
