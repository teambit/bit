import React from 'react';
import moment from 'moment';
import { Text, Newline, Box } from 'ink';
import Spinner from 'ink-spinner';

import { MainUIServerDetails } from '../cli-output';

export type CompilingOrUIServersAreReadyProps = {
  mainUIServerDetails: MainUIServerDetails | null;
  totalComponentsSum: number | null;
  compiledComponentsSum: number;
};

export type UIServersAreReadyProps = {
  mainUIServerDetails: MainUIServerDetails;
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

const UIServersAreReady = ({ mainUIServerDetails }: UIServersAreReadyProps) => (
  <>
    <Text>You can now view {mainUIServerDetails.uiRootName} components in the browser</Text>
    <Text>
      Main UI server is running on http://{mainUIServerDetails.targetHost}:{mainUIServerDetails.targetPort}
    </Text>
    <Newline />
    {!mainUIServerDetails.isScope ? (
      <Text color="yellow">Waiting for component changes... ({moment().format('HH:mm:ss')})</Text>
    ) : null}
  </>
);

export const CompilingOrUIServersAreReady = ({
  mainUIServerDetails,
  totalComponentsSum,
  compiledComponentsSum,
}: CompilingOrUIServersAreReadyProps) => {
  if (!mainUIServerDetails) {
    return null;
  }

  // For 0 componnets
  if (totalComponentsSum === 0 && !!mainUIServerDetails) {
    return <UIServersAreReady mainUIServerDetails={mainUIServerDetails} />;
  }

  if (!!totalComponentsSum && totalComponentsSum <= compiledComponentsSum && !!mainUIServerDetails) {
    return <UIServersAreReady mainUIServerDetails={mainUIServerDetails} />;
  }

  return <DevelopmentServersAreStarting />;
};
