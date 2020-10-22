import { UIAspect, UiServerStartedEvent } from '@teambit/ui';

import chalk from 'chalk';
import moment from 'moment';

export const report = async (
  [uiRootName, userPattern]: [string, string],
  {
    dev,
    port,
    rebuild,
    verbose,
    suppressBrowserLaunch,
  }: { dev: boolean; port: string; rebuild: boolean; verbose: boolean; suppressBrowserLaunch: boolean },
  ui,
  logger,
  pubsub
): Promise<string> => {
  const pattern = userPattern && userPattern.toString();

  ui.createRuntime({
    uiRootName,
    pattern,
    dev,
    port: port ? parseInt(port) : undefined,
    rebuild,
  });

  return new Promise((resolve, reject) => {
    pubsub.sub(UIAspect.id, (event) => {
      if (event.type === UiServerStartedEvent.TYPE) {
        resolve(
          chalk.green(`
            ${moment().format('HH:mm:ss')} - You can now view teambit.harmony-review components in the browser 
            Main UI server is running on http://${event.data.targetHost}:${event.data.targetPort}
        `)
        );
      }
    });
  });
};
