import React from 'react';
import { Text, Box } from 'ink';
import type { ComponentServer } from '@teambit/bundler';

export type PreviewServerRowProps = {
  previewServer: ComponentServer;
  verbose?: boolean;
};

export function PreviewServerRow({ previewServer, verbose }: PreviewServerRowProps) {
  return (
    <Box>
      <Box width="40%">
        <Text color="cyan">
          {previewServer.context.envRuntime.id}
          {previewServer.context.relatedContexts.length ? (
            <Text>
              {' '}
              on behalf of
              {stringifyIncludedEnvs(previewServer.context.relatedContexts, verbose)}
            </Text>
          ) : (
            <></>
          )}
        </Text>
      </Box>
      <Box width="40%">
        <Text>{`http://localhost:${previewServer.port}`}</Text>
      </Box>
      <Box width="20%">
        <Text color="yellow">{'RUNNING'}</Text>
      </Box>
    </Box>
  );
}

function stringifyIncludedEnvs(includedEnvs: string[] = [], verbose = false) {
  if (includedEnvs.length > 2 && !verbose) return ` ${includedEnvs.length} other envs`;
  return includedEnvs.join(', ');
}
