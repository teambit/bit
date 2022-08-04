import React, { useEffect, useState, ComponentType } from 'react';
import { Text, Newline } from 'ink';
import type { UIServer } from '@teambit/ui';
import { UIServerLoader } from '@teambit/ui-foundation.cli.ui-server-loader';

export type UIServerConsoleProps = {
  /**
   * future of the ui server.
   */
  futureUiServer: UIServer;

  /**
   * name of the app.
   */
  appName?: string;

  /** explicity server url */
  url?: string;
};

export function UIServerConsole({ appName, futureUiServer, url }: UIServerConsoleProps) {
  const [uiServer, setUiServer] = useState<UIServer>();
  const [plugins, setPlugins] = useState<ComponentType[]>();

  useEffect(() => {
    console.log('futureUiServer', futureUiServer)
    setUiServer(futureUiServer);
    setPlugins(futureUiServer.getPluginsComponents());
  }, []);

  if (!uiServer) return <UIServerLoader name={appName} />;

  return (
    <>
      {plugins?.map((Plugin, key) => {
        return <Plugin key={key} />;
      })}
      <Newline />
      <Text>
        You can now view '<Text color="cyan">{uiServer?.getName()}</Text>' components in the browser.
      </Text>
      <Text>Bit server is running on {url || uiServer.fullUrl}</Text>
    </>
  );
}
