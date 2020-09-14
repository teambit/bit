import { Box } from 'ink';
import React from 'react';

export type props = {
  workspace: string;
};

export const InitializeStartOutput = ({ workspace }: props) => {
  return <Box>Starting the development server for {workspace})...</Box>;
};
