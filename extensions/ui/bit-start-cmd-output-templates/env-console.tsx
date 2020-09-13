import { Box } from 'ink';
import React from 'react';

import { UIServer } from '../ui-server';

export type UIServerConsoleProps = {
  uiServer: UIServer;
};

export function UIServerConsole({ uiServer }: UIServerConsoleProps) {
  return (
    <Box>
      Starting the development server for $(workspace)... if(change) Building workspace UI according to the
      configuration found in ./workspace.jsonc [clear previous outputs] You can now view $[workspace] components in the
      browser. Local: http://localhost:{uiServer.port}
      On Your Network: http://10.0.0.2:{uiServer.port} # IMPORTANT, do we support this feature? There are [num-envs]
      running for this workspace [env-name] https://localhost:${uiServer.port}
      teambit.bit/react https://localhost:3001 Waiting for component changes (${new Date().toISOString()})...
      {/* BBit UI server is listening to port {uiServer.port} */}
    </Box>
  );
}
