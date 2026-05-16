import React from 'react';
import type { CompositionsUI } from '@teambit/compositions';
import { CompositionsAspect } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import type { TesterUI } from '@teambit/tester';
import { TesterAspect } from '@teambit/tester';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { AspectAspect } from './aspect.aspect';

export class AspectEnvUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const aspectEnvUI = new AspectEnvUI();
    testerUi.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any tests."
          linkText="Learn how to add tests to your aspect components"
          link={`https://bit.dev/reference/dev-services-overview/tester/tester-overview`}
        />
      );
    });
    compositionsUI.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any compositions."
          linkText="Learn how to add compositions to your aspect components"
          link={`https://bit.dev/reference/dev-services-overview/compositions/compositions-overview`}
        />
      );
    });

    return aspectEnvUI;
  }
}

AspectAspect.addRuntime(AspectEnvUI);

export default AspectEnvUI;
