import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { PubsubAspect, PubsubUI } from '@teambit/pubsub';
import { UIRuntime } from '@teambit/ui';
import { ReactAspect } from './react.aspect';
import { HighlighterWidget } from './highlighter-widget';

export class ReactUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, PubsubAspect];

  static async provider([compositionsUI, pubsubUI]: [CompositionsUI, PubsubUI]) {
    const reactUI = new ReactUI();

    compositionsUI.registerPanelWidget({
      location: 'start',
      content: <HighlighterWidget pubSub={pubsubUI} />,
    });

    return reactUI;
  }
}

ReactAspect.addRuntime(ReactUI);

export default ReactUI;
