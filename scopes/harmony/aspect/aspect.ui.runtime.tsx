import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { TesterAspect, TesterUI } from '@teambit/tester';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { AspectAspect } from './aspect.aspect';

export class AspectEnvUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const aspectEnvUI = new AspectEnvUI();
    // TODO: get the docs domain from the community aspect and pass it here as a prop
    testerUi.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any tests."
          linkText="Learn how to add tests to your aspect components"
          link={`https://bit.dev/docs/dev-services-overview/tester/tester-overview`}
        />
      );
    });
    // TODO: get the docs domain from the community aspect and pass it here as a prop
    compositionsUI.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any compositions."
          linkText="Learn how to add compositions to your aspect components"
          link={`https://bit.dev/docs/dev-services-overview/compositions/compositions-overview`}
        />
      );
    });

    return aspectEnvUI;
  }
}

AspectAspect.addRuntime(AspectEnvUI);

export default AspectEnvUI;
