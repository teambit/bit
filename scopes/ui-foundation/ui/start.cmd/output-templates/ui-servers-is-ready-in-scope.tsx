import React from 'react';
import { Text } from 'ink';
import moment from 'moment';

export type compilingOrUIServersAreReadyProps = {
  mainUIServer: any;
  totalComponentsSum: number | null;
  compiledComponentsSum: number;
};

export type props = {
  mainUIServer: any;
};

export const UIServersAreReadyInScope = ({ mainUIServer }: props) => (
  <>
    <Text>You can now view {mainUIServer.uiRoot.name} components in the browser</Text>
    <Text>
      UI server is running on port {mainUIServer.port} ({moment().format('HH:mm:ss')})
    </Text>
  </>
);
