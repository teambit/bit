import React from 'react';
import { Text, Box } from 'ink';
import moment from 'moment';

export const UIServersAreReady = ({ host, port, timestamp, workspace }) => (
  <>
    <Box>
      <Text>You can now view {workspace.id} components in the browser.</Text>
    </Box>
    <Box>
      <Text>
        {`Main UI server is running, running on http://${host}:${port} `} <Text color="yellow">{timestamp}</Text>
      </Text>
    </Box>
    <Box>{`\n`}</Box>
    <Box>
      <Text>
        <Text color="yellow">
          {`Waiting for component changes (${timestamp})... `} {`(${moment().format('HH:MM:SS')})`}
        </Text>
      </Text>
    </Box>
  </>
);
