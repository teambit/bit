import React from 'react';
import moment from 'moment';
import { Text, Newline, Box } from 'ink';
import Spinner from 'ink-spinner';

export type compilingOrUIServersAreReadyProps = {
  mainUIServer: any;
  totalComponentsSum: number | null;
  compiledComponentsSum: number;
};

export type uIServersAreReadyProps = {
  mainUIServer: any;
};

const DevelopmentServersAreStarting = () => (
  <Box paddingTop={1}>
    <Text>
      <Text color="green">
        <Spinner type="dots" />
      </Text>{' '}
      Development servers are starting...
    </Text>
  </Box>
);

const UIServersAreReady = ({ mainUIServer }: uIServersAreReadyProps) => (
  <>
    <Text>You can now view {mainUIServer.uiRoot.name} components in the browser</Text>
    <Text>
      Bit server is running on http://{mainUIServer.targetHost}:{mainUIServer.targetPort}
    </Text>
    <Newline />
    {mainUIServer.uiRoot.workspace ? (
      <Text color="yellow">Waiting for component changes... ({moment().format('HH:mm:ss')})</Text>
    ) : null}
  </>
);

export const CompilingOrUIServersAreReady = ({
  totalComponentsSum,
  compiledComponentsSum,
  mainUIServer,
}: compilingOrUIServersAreReadyProps) => {
  if (!mainUIServer) {
    return null;
  }

  // For 0 componnets
  if (totalComponentsSum === 0 && !!mainUIServer) {
    return <UIServersAreReady mainUIServer={mainUIServer} />;
  }

  if (!!totalComponentsSum && totalComponentsSum <= compiledComponentsSum && !!mainUIServer) {
    return <UIServersAreReady mainUIServer={mainUIServer} />;
  }

  return <DevelopmentServersAreStarting />;
};
