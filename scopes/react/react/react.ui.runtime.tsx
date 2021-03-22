import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { ReactAspect } from './react.aspect';
import { HighlighterWidget } from './highlighter-widget';

export class ReactUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect];

  static async provider([compositionsUI]: [CompositionsUI]) {
    const reactUI = new ReactUI();

    compositionsUI.registerPanelWidget({
      location: 'start',
      content: <HighlighterWidget />,
    });

    return reactUI;
  }
}

ReactAspect.addRuntime(ReactUI);

export default ReactUI;
