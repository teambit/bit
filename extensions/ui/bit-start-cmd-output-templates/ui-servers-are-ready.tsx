import React from 'react';
import { Text, Newline } from 'ink';
import moment from 'moment';

export const UIServersAreReady = ({ host, port, timestamp, workspace }: any) => (
  <>
    <Text>You can now view {workspace.id} components in the browser.</Text>
    <Text>
      Main UI server is running on http://{host}:{port} <Text color="yellow">{timestamp}</Text>
    </Text>
    <Newline />
    <Text color="yellow">Waiting for component changes... ({moment().format('HH:mm:ss')})</Text>
  </>
);
