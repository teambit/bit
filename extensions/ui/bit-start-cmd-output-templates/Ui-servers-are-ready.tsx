import React from 'react';
import { Text, Color, Box } from 'ink';
import moment from 'moment';

export const UIServersAreReady = ({ host, port, timestamp, workspace }) => (
  <>
    <Box>
      <Text>You can now view {workspace.id} components in the browser.</Text>
    </Box>
    <Box>
      <Text>
        {`Main UI server is running, running on http://${host}:${port} `} <Color yellow>{timestamp}</Color>
      </Text>
    </Box>
    <Box>{`\n`}</Box>
    <Box>
      <Text>
        <Color yellow>
          {`Waiting for component changes (${timestamp})... `} {`(${moment().format('HH:MM:SS')})`}
        </Color>
      </Text>
    </Box>
  </>
);
