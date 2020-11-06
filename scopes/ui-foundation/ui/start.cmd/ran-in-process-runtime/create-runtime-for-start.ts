import { UiMain } from '@teambit/ui';
import { PubsubMain } from '@teambit/pubsub';
// import { ipc } from 'node-ipc';

export const createRuntimeForStart = (
  ui: UiMain,
  pubsub: PubsubMain,
  uiRootName: string | undefined,
  pattern: string | undefined,
  dev: boolean | undefined,
  port: string | undefined,
  rebuild: boolean | undefined
) => {
  // pubsub.sub('topicUUID', () => {
  //   // TODO send messge out

  return ui
    .createRuntime({
      uiRootName,
      pattern,
      dev,
      port: port ? parseInt(port) : undefined,
      rebuild,
    })
    .then((uiServer) => {
      // https://github.com/nodejs/node/issues/22088
      setInterval(() => {}, 5000);
    })
    .catch((e) => {
      throw e;
    });
};
