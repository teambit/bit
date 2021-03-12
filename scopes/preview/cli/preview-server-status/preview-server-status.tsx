import React from 'react';
import { usePreviewServer } from '@teambit/cli.use-preview-server';
import { Text, Box, Newline } from 'ink';
import { Error, ErrorLevel } from '@teambit/cli.webpack.error';
// TODO: refactor ComponentServer from bundler to Preview.
import { ComponentServer } from '@teambit/bundler';
import { PubsubMain } from '@teambit/pubsub';
import { PreviewServerHeader } from './preview-server-header';
import { PreviewServerRow } from './preview-server-row';

export type PreviewServerStatusProps = {
  previewServers: ComponentServer[];
  pubsub: PubsubMain;
};

export function PreviewServerStatus({ previewServers, pubsub }: PreviewServerStatusProps) {
  const { errors, warnings, compiling } = usePreviewServer({ pubsub });

  if (errors.length) {
    return <Error errors={errors} level={ErrorLevel.ERROR} />;
  }
  if (compiling) {
    return <Text>Compiling...</Text>;
  }

  return (
    <>
      <PreviewServerHeader />
      {previewServers.map((server, key) => {
        return <PreviewServerRow key={key} previewServer={server} />;
      })}
      {warnings.length ? (
        <Box marginTop={1} flexDirection="column">
          <Newline />
          <Error errors={warnings} level={ErrorLevel.WARNING} />
        </Box>
      ) : undefined}
    </>
  );
}
