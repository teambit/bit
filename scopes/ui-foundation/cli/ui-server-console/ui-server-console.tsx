import React, { useEffect, useState } from 'react';
import { Text, Newline } from 'ink';
import type { UIServer } from '@teambit/ui';
import { UIServerLoader } from '@teambit/ui-foundation.cli.ui-server-loader';

export type UIServerConsoleProps = {
  /**
   * future of the ui server.
   */
  futureUiServer: Promise<UIServer>;

  /**
   * name of the app.
   */
  appName: string;
};

export function UIServerConsole({ appName, futureUiServer }: UIServerConsoleProps) {
  const [uiServer, setUiServer] = useState<UIServer>();

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
