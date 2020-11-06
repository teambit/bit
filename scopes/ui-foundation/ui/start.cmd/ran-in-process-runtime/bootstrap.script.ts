import { createRuntimeForStart } from './create-runtime-for-start';
import { init } from './full-harmony-bootstrap';

import { UiMain } from '@teambit/ui';
import { PubsubMain } from '@teambit/pubsub';

// Import the IDs & Events
import { BitBaseEvent } from '@teambit/pubsub';
import {
  WorkspaceAspect,
  OnComponentChangeEvent,
  OnComponentAddEvent,
  OnComponentRemovedEvent,
} from '@teambit/workspace';
import { UIAspect, UiServerStartedEvent } from '@teambit/ui';
import { WebpackAspect, WebpackCompilationDoneEvent, WebpackCompilationStartedEvent } from '@teambit/webpack';
import { BundlerAspect, ComponentsServerStartedEvent } from '@teambit/bundler';
import { CompilerAspect, CompilerErrorEvent } from '@teambit/compiler';

const eventsListener = (event: BitBaseEvent<any>) => {
  console.log('event: ', event);
};

const registerToEvents = (pubsub) => {
  pubsub.sub(UIAspect.id, eventsListener);
  pubsub.sub(WebpackAspect.id, eventsListener);
  pubsub.sub(BundlerAspect.id, eventsListener);
  pubsub.sub(WorkspaceAspect.id, eventsListener);
  pubsub.sub(CompilerAspect.id, eventsListener);
};

init()
  .then((harmony) => {
    return {
      ui: harmony!.get<UiMain>('teambit.ui-foundation/ui'),
      pubsub: harmony!.get<PubsubMain>('teambit.harmony/pubsub'),
    };
  })
  .then((aspects) => {
    registerToEvents(aspects.pubsub);

    const ui: UiMain = aspects.ui;
    const pubsub: PubsubMain = aspects.pubsub;
    const uiRootName = undefined;
    const pattern = undefined;
    const dev = undefined;
    const port = undefined;
    const rebuild = undefined;
    return createRuntimeForStart(ui, pubsub, uiRootName, pattern, dev, port, rebuild);
  })
  .then(() => {
    // https://github.com/nodejs/node/issues/22088
    setInterval(() => {}, 5000);
  });
