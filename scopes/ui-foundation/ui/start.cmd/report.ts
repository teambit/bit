import { UIAspect, UiServerStartedEvent } from '@teambit/ui';

import moment from 'moment';

export const report = async (
  [uiRootName, userPattern]: [string, string],
  { dev, port, rebuild }: { dev: boolean; port: string; rebuild: boolean },
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise((resolve, reject) => {
    // https://github.com/nodejs/node/issues/22088
    setInterval(() => {}, 5000);

    pubsub.sub(UIAspect.id, (event) => {
      if (event.type === UiServerStartedEvent.TYPE) {
        logger.console(`
  ${moment().format('HH:mm:ss')} - You can now view the components in the browser
  Bit server is running on http://${event.data.targetHost}:${event.data.targetPort}
          `);
      }
    });
  });
};
