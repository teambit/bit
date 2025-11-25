import React from 'react';
import type { CompositionsUI } from '@teambit/compositions';
import { CompositionsAspect } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import type { TesterUI } from '@teambit/tester';
import { TesterAspect } from '@teambit/tester';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { NodeAspect } from './node.aspect';

export class NodeEnvUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const nodeEnvUI = new NodeEnvUI();
    testerUi.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any tests."
          linkText="Learn how to add tests to your node components"
          link={`https://bit.dev/reference/dev-services-overview/tester/tester-overview`}
        />
      );
    });

    compositionsUI.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any compositions."
          linkText="Learn how to add compositions to your node components"
          link={`https://bit.dev/reference/dev-services-overview/compositions/compositions-overview`}
        />
      );
    });

    return nodeEnvUI;
  }
}

NodeAspect.addRuntime(NodeEnvUI);

export default NodeEnvUI;
