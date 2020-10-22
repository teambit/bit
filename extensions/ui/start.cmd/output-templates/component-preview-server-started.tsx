import React from 'react';
import { Box, Text } from 'ink';
import { ComponentPreviewServerStartedHeaders } from '.';

export type props = {
  items: Array<any>;
};

export const ComponentPreviewServerStarted = ({ items }: props) =>
  !items.length ? null : (
    <>
      <ComponentPreviewServerStartedHeaders />
      {items.map((item, index) => (
        <Box key={index}>
          <Box width="40%">
            <Text color="rgb(45, 164, 157)">{item.id}</Text>
          </Box>
          <Box width="40%">
            <Text>{`http://${item.server.host || 'localhost'}:${item.server.port}`}</Text>
          </Box>
          <Box width="20%">
            <Text color="yellow">{item.status}</Text>
          </Box>
        </Box>
      ))}
    </>
  );
