import React from 'react';
import { Text, Newline } from 'ink';
import moment from 'moment';

export type props = {
  mainUIServer: any;
};

export const UIServersAreReady = ({ mainUIServer }: props) =>
  !mainUIServer ? null : (
    <>
      <Text>You can now view {mainUIServer.uiRoot.name} components in the browser</Text>
      <Text>
        Main UI server is running on http://{mainUIServer.targetHost}:{mainUIServer.targetPort}
      </Text>
      <Newline />
      <Text color="yellow">Waiting for component changes... ({moment().format('HH:mm:ss')})</Text>
    </>
  );
