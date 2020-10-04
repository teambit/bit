import React from 'react';
import { Box, Text } from 'ink';
import { ComponentPreviewServerStartedHeaders } from '.';

export const ComponentPreviewServerStarted = ({ items }: any) => (
  <>
    <ComponentPreviewServerStartedHeaders />
    {items.map((item, index) => (
      <Box key={index}>
        <Box width="30%">
          <Text color="rgb(45, 164, 157)">{item.envName}</Text>
        </Box>
        <Box width="50%">
          <Text>{`Component Preview Server Started on http://${item.host}:${item.port} `}</Text>
        </Box>
        <Box width="20%">
          <Text color="yellow">{item.timestamp}</Text>
        </Box>
      </Box>
    ))}
  </>
);
