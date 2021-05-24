import React, { useMemo } from 'react';
import { Text, Box } from 'ink';
import flatten from 'lodash.flatten';
import head from 'lodash.head';
import { Error, ErrorLevel } from '@teambit/compilation.cli.webpack.error';
// TODO: refactor ComponentServer from bundler to Preview.
import { ComponentServer } from '@teambit/bundler';
import type { CompilationResult } from '@teambit/preview.cli.webpack-events-listener';
import { PreviewServerHeader } from './preview-server-header';
import { PreviewServerRow } from './preview-server-row';

export type PreviewServerStatusProps = {
  previewServers: ComponentServer[];
  serverStats?: Record<string, CompilationResult>;
};

export function PreviewServerStatus({ previewServers, serverStats: servers = {} }: PreviewServerStatusProps) {
  const isCompiling = useMemo(() => Object.values(servers).some((x) => x.compiling), [servers]);
  const errors = useMemo(
    () =>
      head(
        Object.values(servers)
          .map((x) => x.errors)
          .filter((x) => !!x)
      ),
    [servers]
  );
  const warnings = useMemo(() => flatten(Object.values(servers).map((x) => x.warnings)), [servers]);

  if (errors && errors.length) {
    return <Error errors={errors} level={ErrorLevel.ERROR} />;
  }

  if (isCompiling) {
    return <Text>Compiling...</Text>;
  }

  return (
    <>
      <PreviewServerHeader />
      {previewServers.map((server, key) => {
        return <PreviewServerRow key={key} previewServer={server} />;
      })}

      {warnings && warnings.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {/* could add dev-server name */}
          <Error errors={warnings} level={ErrorLevel.WARNING} />
        </Box>
      )}
    </>
  );
}
