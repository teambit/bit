import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { TesterAspect, TesterUI } from '@teambit/tester';
import { AddingTests } from '@teambit/react.instructions.react.adding-tests';
import { AddingCompositions } from '@teambit/react.instructions.react.adding-compositions';
import { APIReferenceAspect, APIReferenceUI } from '@teambit/api-reference';
import { reactRenderer } from '@teambit/api-reference.renderers.react';

import { ReactAspect } from './react.aspect';
import { HighlighterWidget } from './highlighter-widget';
import { ReactSchema } from './react.schema';
import { tempRenderer } from './temp.renderer';

export class ReactUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect, APIReferenceAspect];

  static async provider([compositionsUI, testerUi, apiUI]: [CompositionsUI, TesterUI, APIReferenceUI]) {
    const reactUI = new ReactUI();
    testerUi.registerEmptyState(() => {
      return <AddingTests />;
    });
    compositionsUI.registerEmptyState(() => {
      return <AddingCompositions />;
    });

    apiUI.registerSchemaClasses(() => [ReactSchema]);
    apiUI.registerAPINodeRenderer([reactRenderer]);
    apiUI.registerAPINodeRenderer([tempRenderer]);

    compositionsUI.registerMenuWidget({
      location: 'start',
      content: <HighlighterWidget />,
    });

    return reactUI;
  }
}

ReactAspect.addRuntime(ReactUI);

export default ReactUI;
