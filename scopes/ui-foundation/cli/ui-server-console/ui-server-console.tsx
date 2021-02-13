import React, { useEffect, useState } from 'react';
import { Text, Newline } from 'ink';
import type { UIServer } from '@teambit/ui';
import { UIServerLoader } from '@teambit/cli.ui-server-loader';
import { PubsubMain } from '@teambit/pubsub';

export type UIServerConsoleProps = {
  /**
   * future of the ui server.
   */
  futureUiServer: Promise<UIServer>;

  /**
   * name of the app.
   */
  appName: string;

  pubsub: PubsubMain;
};

export function UIServerConsole({ appName, futureUiServer, pubsub }: UIServerConsoleProps) {
  const [uiServer, setUiServer] = useState<UIServer>();
  // const { errors, warnings, compiling } = usePreviewServer({ pubsub });

  useEffect(() => {
    futureUiServer
      .then((server) => {
        setUiServer(server);
      })
      .catch((err) => {
        throw err;
      });
  });

  if (!uiServer) return <UIServerLoader name={appName} />;
  // if (errors.length) return <Error errors={errors} level={ErrorLevel.ERROR} />;
  // if (compiling) return <Text>Compiling...</Text>;
  // if (warnings.length) return <Error errors={warnings} level={ErrorLevel.WARNING} />;
  const plugins = uiServer.getPluginsComponents();

  return (
    <>
      {plugins.map((Plugin, key) => {
        return <Plugin key={key} />;
      })}
      <Newline />
      <Text>
        You can now view '<Text color="cyan">{appName}</Text>' components in the browser.
      </Text>
      <Text>Bit server is running on http://localhost:{uiServer.port}</Text>
    </>
  );
}

UIServerConsole.defaultProps = {
  futureStartPlugins: Promise.resolve([]),
};
