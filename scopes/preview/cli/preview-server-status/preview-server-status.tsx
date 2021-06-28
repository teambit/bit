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

export const IGNORE_WARNINGS = [
  // Webpack 5+ has no facility to disable this warning.
  // System.import is used in @angular/core for deprecated string-form lazy routes
  /System.import\(\) is deprecated and will be removed soon/i,
  // https://github.com/webpack-contrib/source-map-loader/blob/b2de4249c7431dd8432da607e08f0f65e9d64219/src/index.js#L83
  /Failed to parse source map from/,
];

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
  const warnings = useMemo(() => flatten(Object.values(servers).map((x) => x.warnings)), [servers]).filter(
    (warning) => !IGNORE_WARNINGS.find((reg) => warning?.message?.match(reg))
  );

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
