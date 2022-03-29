import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { TesterAspect, TesterUI } from '@teambit/tester';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { NodeAspect } from './node.aspect';

export class NodeEnvUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const nodeEnvUI = new NodeEnvUI();
    // TODO: pass the docs url into here after fetch it from the community aspect
    testerUi.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any tests."
          linkText="Learn how to add tests to your node components"
          link={`https://bit.dev/docs/dev-services-overview/tester/tester-overview`}
        />
      );
    });

    // TODO: pass the docs url into here after fetch it from the community aspect
    compositionsUI.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any compositions."
          linkText="Learn how to add compositions to your node components"
          link={`https://bit.dev/docs/dev-services-overview/compositions/compositions-overview`}
        />
      );
    });

    return nodeEnvUI;
  }
}

NodeAspect.addRuntime(NodeEnvUI);

export default NodeEnvUI;
