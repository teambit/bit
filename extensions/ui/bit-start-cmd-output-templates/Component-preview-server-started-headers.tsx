import React from 'react';
import { Box, Text } from 'ink';

export const ComponentPreviewServerStartedHeaders = () => (
  <Box>
    <Box width="30%">
      <Text bold underline>
        Environment Name
      </Text>
    </Box>
    <Box width="50%">
      <Text bold underline>
        Status
      </Text>
    </Box>
    <Box width="20%">
      <Text bold underline>
        Duration
      </Text>
    </Box>
  </Box>
);
