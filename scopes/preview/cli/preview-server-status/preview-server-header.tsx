import React from 'react';
import { Box, Text } from 'ink';

export function PreviewServerHeader() {
  return (
    <Box>
      <Box width="40%">
        <Text underline>ENVIRONMENT NAME</Text>
      </Box>
      <Box width="40%">
        <Text underline>URL</Text>
      </Box>
      <Box width="20%">
        <Text underline>STATUS</Text>
      </Box>
    </Box>
  );
}
