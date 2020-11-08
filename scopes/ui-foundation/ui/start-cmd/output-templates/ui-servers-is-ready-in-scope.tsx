import React from 'react';
import { Text } from 'ink';
import moment from 'moment';

export type UIServersAreReadyInScopeProps = {
  uiRootName: string;
  port: number;
};

export const UIServersAreReadyInScope = ({ uiRootName, port }: UIServersAreReadyInScopeProps) => (
  <>
    <Text>You can now view {uiRootName} components in the browser</Text>
    <Text>
      UI server is running on port {port} ({moment().format('HH:mm:ss')})
    </Text>
  </>
);
