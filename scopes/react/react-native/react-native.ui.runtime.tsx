import React from 'react';
import { CompositionsAspect, CompositionsUI } from '@teambit/compositions';
import { UIRuntime } from '@teambit/ui';
import { TesterAspect, TesterUI } from '@teambit/tester';
import { AddingCompositions } from '@teambit/react.instructions.react.adding-compositions';
import { AddingTests } from '@teambit/react.instructions.react-native.adding-tests';
import { ReactNativeAspect } from './react-native.aspect';

export class ReactNativeEnvUI {
  static runtime = UIRuntime;
  static slots = [];
  static dependencies = [CompositionsAspect, TesterAspect];

  static async provider([compositionsUI, testerUi]: [CompositionsUI, TesterUI]) {
    const reactNativeEnvUI = new ReactNativeEnvUI();

    testerUi.registerEmptyState(() => {
      return <AddingTests />;
    });

    compositionsUI.registerEmptyState(() => {
      return <AddingCompositions />;
    });

    return reactNativeEnvUI;
  }
}

ReactNativeAspect.addRuntime(ReactNativeEnvUI);

export default ReactNativeEnvUI;
