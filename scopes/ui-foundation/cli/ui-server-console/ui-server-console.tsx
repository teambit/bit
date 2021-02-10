import React, { useEffect, useState, ComponentType } from 'react';
import { Text, Newline } from 'ink';
import type { UIServer } from '@teambit/ui';
import { UIServerLoader } from '@teambit/cli.ui-server-loader';

export type UIServerConsoleProps = {
  /**
   * future of the ui server.
   */
  futureUiServer: Promise<UIServer>;

  /**
   * name of the app.
   */
  appName: string;

  /**
   * array of plugins of the command.
   */
  futureStartPlugins: Promise<ComponentType[]>;
};

export function UIServerConsole({ appName, futureUiServer, futureStartPlugins }: UIServerConsoleProps) {
  const [uiServer, setUiServer] = useState<UIServer>();
  const [plugins, setPlugins] = useState<ComponentType[]>();

  useEffect(() => {
    futureUiServer
      .then((server) => {
        setUiServer(server);
      })
      .catch((err) => {
        throw err;
      });

    futureStartPlugins
      .then((startPlugins) => {
        setPlugins(startPlugins);
      })
      .catch((err) => {
        throw err;
      });
  });

  if (!uiServer || !plugins) return <UIServerLoader name={appName} />;

  return (
    <>
      {plugins &&
        plugins.map((Plugin, key) => {
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
