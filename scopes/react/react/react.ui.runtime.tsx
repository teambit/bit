import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { TesterAspect, TesterUI } from '@teambit/tester';
import { AddingTests } from '@teambit/react.instructions.react.adding-tests';
import { AddingCompositions } from '@teambit/react.instructions.react.adding-compositions';
import { ReactAspect } from './react.aspect';
import { HighlighterWidget } from './highlighter-widget';

export class ReactUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const reactUI = new ReactUI();
    testerUi.registerEmptyState(() => {
      return <AddingTests />;
    });
    compositionsUI.registerEmptyState(() => {
      return <AddingCompositions />;
    });

    compositionsUI.registerMenuWidget({
      location: 'start',
      content: <HighlighterWidget />,
    });

    return reactUI;
  }
}

ReactAspect.addRuntime(ReactUI);

export default ReactUI;
