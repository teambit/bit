import React from 'react';
import type { CompositionsUI } from '@teambit/compositions';
import { CompositionsAspect } from '@teambit/compositions/dist/compositions.aspect.js';
import { UIRuntime } from '@teambit/ui';
import type { TesterUI } from '@teambit/tester';
import { TesterAspect } from '@teambit/tester/dist/tester.aspect.js';
import { AddingTests } from '@teambit/react.instructions.react.adding-tests';
import { AddingCompositions } from '@teambit/react.instructions.react.adding-compositions';
import type { APIReferenceUI } from '@teambit/api-reference';
import { APIReferenceAspect } from '@teambit/api-reference/dist/api-reference.aspect.js';
import { reactRenderer } from '@teambit/api-reference.renderers.react';

import { ReactAspect } from './react.aspect';
import { HighlighterWidget } from './highlighter-widget';
import { ReactSchema } from './react.schema';

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

    compositionsUI.registerMenuWidget({
      location: 'start',
      content: <HighlighterWidget />,
    });

    return reactUI;
  }
}

ReactAspect.addRuntime(ReactUI);

export default ReactUI;
