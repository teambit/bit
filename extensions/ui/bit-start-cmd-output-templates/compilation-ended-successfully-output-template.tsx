import React from 'react';
import { render, Box, Color } from 'ink';

// import React, {useState, useEffect} from 'react';
// import {render, Text} from 'ink';

// import { UIServer } from '../ui-server';

export type props = {
  port: string;
  workspace: string;
  duration: string;
  // envs: [any];
  envs: any;
  timestamp: string;
};

export const compilationEndedSuccessfullyOutput = ({ port, workspace, duration, envs, timestamp }: props) => {
  render(
    <Color green>
      Compiled successfully! ({duration}) You can now view {workspace} components in the browser. Local:
      http://localhost:{port}
      On Your Network: http://10.0.0.2:{port} # IMPORTANT, do we support this feature? There are {envs.length} running
      for this workspace.
      {envs.map(
        (env) => `${env.name}        https://localhost:${env.port}` // teambit.bit/react   https://localhost:3001
      )}
      Waiting for component changes (${timestamp})...
    </Color>
  );
};
