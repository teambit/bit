import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { TesterAspect, TesterUI } from '@teambit/tester';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { ReactNativeAspect } from './react-native.aspect';

export class ReactNativeEnvUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const reactNativeEnvUI = new ReactNativeEnvUI();

    testerUi.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any tests."
          linkText="Learn how to add tests to your React Native components"
          link="https://harmony-docs.bit.dev/testing/overview/"
        />
      );
    });

    compositionsUI.registerEmptyState(() => {
      return (
        <EmptyBox
          title="This component doesn’t have any compositions."
          linkText="Learn how to add compositions to your React Native components"
          link="https://harmony-docs.bit.dev/compositions/overview/"
        />
      );
    });

    return reactNativeEnvUI;
  }
}

ReactNativeAspect.addRuntime(ReactNativeEnvUI);

export default ReactNativeEnvUI;
