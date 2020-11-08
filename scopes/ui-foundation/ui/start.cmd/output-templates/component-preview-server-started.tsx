import React from 'react';
import { Box, Text } from 'ink';
import { ComponentPreviewServerStartedHeaders } from '.';
import { DevServer } from '../cli-output';

export type ComponentPreviewServerStartedProps = {
  devServers: Array<DevServer>;
};

export const ComponentPreviewServerStarted = ({ devServers }: ComponentPreviewServerStartedProps) =>
  !devServers.length ? null : (
    <>
      <ComponentPreviewServerStartedHeaders />
      {devServers
        .sort((serverA, serverB) => (serverA.id > serverB.id ? 1 : -1))
        .map((server, index) => (
          <Box key={index}>
            <Box width="40%">
              <Text color="rgb(45, 164, 157)">{server.id}</Text>
            </Box>
            <Box width="40%">
              <Text>{`http://${server.targetHost || 'localhost'}:${server.targetPort}`}</Text>
            </Box>
            <Box width="20%">
              <Text color="yellow">{server.status}</Text>
            </Box>
          </Box>
        ))}
    </>
  );
