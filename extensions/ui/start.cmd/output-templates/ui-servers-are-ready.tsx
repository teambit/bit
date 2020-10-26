import React from 'react';
import { Text, Newline } from 'ink';
import moment from 'moment';

export type compilingOrUIServersAreReadyProps = {
  mainUIServer: any;
  totalComponentsSum: number | null;
  compiledComponentsSum: number;
};

export type uIServersAreReadyProps = {
  mainUIServer: any;
};

const CompiledComponents = ({ totalComponentsSum, compiledComponentsSum }) => (
  <Text>
    Compiled {compiledComponentsSum} components out of {totalComponentsSum}...
  </Text>
);

export const UIServersAreReady = ({ mainUIServer }: uIServersAreReadyProps) => (
  <>
    <Text>You can now view {mainUIServer.uiRoot.name} components in the browser</Text>
    <Text>
      Main UI server is running on http://{mainUIServer.targetHost}:{mainUIServer.targetPort}
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

  return <CompiledComponents totalComponentsSum={totalComponentsSum} compiledComponentsSum={compiledComponentsSum} />;
};
