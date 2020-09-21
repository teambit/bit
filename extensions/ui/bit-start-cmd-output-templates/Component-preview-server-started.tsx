import React from 'react';
import { Box, Color } from 'ink';

export const ComponentPreviewServerStarted = ({ envName, host, port, timestamp }) => (
  <Box>
    <Box width="30%">
      <Color rgb={[45, 164, 157]}>{envName}</Color>
    </Box>
    <Box width="50%">{`Component Preview Server Started on http://${host}:${port} `}</Box>
    <Box width="20%">
      <Color yellow>{timestamp}</Color>
    </Box>
  </Box>
);
