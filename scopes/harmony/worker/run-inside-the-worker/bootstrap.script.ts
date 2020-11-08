import { init } from './full-harmony-bootstrap';

import type { SpawnOptions } from '../worker.main.runtime';

// import { UiMain } from '@teambit/ui';
// import { PubsubMain } from '@teambit/pubsub';

// Import the IDs & Events
// import { BitBaseEvent } from '@teambit/pubsub';
// import {
//   WorkspaceAspect,
//   OnComponentChangeEvent,
//   OnComponentAddEvent,
//   OnComponentRemovedEvent,
// } from '@teambit/workspace';
// import { UIAspect, UiServerStartedEvent } from '@teambit/ui';
// import { WebpackAspect, WebpackCompilationDoneEvent, WebpackCompilationStartedEvent } from '@teambit/webpack';
// import { BundlerAspect, ComponentsServerStartedEvent } from '@teambit/bundler';
// import { CompilerAspect, CompilerErrorEvent } from '@teambit/compiler';

// const eventsListener = (event: BitBaseEvent<any>) => {
//   console.log('event: ', event);
// };

// const registerToEvents = (pubsub) => {
//   pubsub.sub(UIAspect.id, eventsListener);
//   pubsub.sub(WebpackAspect.id, eventsListener);
//   pubsub.sub(BundlerAspect.id, eventsListener);
//   pubsub.sub(WorkspaceAspect.id, eventsListener);
//   pubsub.sub(CompilerAspect.id, eventsListener);
// };

// console.log(process.argv.slice(2).pop());
const serializedParams = process.argv.slice(2).pop();
if (!serializedParams) {
  throw new Error('No parameters found');
}

const options: SpawnOptions = JSON.parse(serializedParams);
// console.log('---> ', options);
init()
  .then((harmony) => {
    const mainAspect = harmony!.get<any>(options.aspectId);
    return mainAspect;
  })
  .then((mainAspect) => {
    // await registerToEvents(aspects.pubsub);
    // process.send(message)

    // process.send!({ foo: 'bar', baz: NaN });

    return mainAspect[options.execMethodName].apply(mainAspect, options.params);
  })
  .then((results) => {
    // console.log(results);
    // // https://github.com/nodejs/node/issues/22088
    // setInterval(() => {}, 5000);
  });
