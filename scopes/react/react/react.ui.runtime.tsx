import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { TesterAspect, TesterUI } from '@teambit/tester';
import { EmptyBox } from '@teambit/ui.empty-box';
import { ReactAspect } from './react.aspect';
import { HighlighterWidget } from './highlighter-widget';

export class ReactUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const reactUI = new ReactUI();
    testerUi.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any tests."
          linkText="Learn how to add tests to your react components"
          link="https://harmony-docs.bit.dev/testing/overview/"
        />
      );
    });
    compositionsUI.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any compositions."
          linkText="Learn how to add tests to your react components"
          link="https://harmony-docs.bit.dev/testing/overview/"
        />
      );
    });

    if (typeof window !== 'undefined' && window.location.search.includes('highlighter')) {
      compositionsUI.registerMenuWidget({
        location: 'start',
        content: <HighlighterWidget />,
      });
    }

    return reactUI;
  }
}

ReactAspect.addRuntime(ReactUI);

export default ReactUI;
