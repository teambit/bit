import { Box, Text } from 'ink';
import React from 'react';

export type props = {
  workspace: string;
};

export const InitializeStartOutput = ({ workspace }: props) => {
  return (
    <Box>
      <Text>Starting the development server for {workspace})...</Text>
    </Box>
  );
};
