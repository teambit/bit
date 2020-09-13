import { Box } from 'ink';
import React from 'react';

export type props = {
  workspaceFilePath: string;
};

export const BuildingDevServerOutput = ({ workspaceFilePath }: props) => {
  return <Box>Building workspace UI according to the configuration found in {workspaceFilePath}</Box>;
};
