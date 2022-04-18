import React from 'react';
import { UIRuntime } from '@teambit/ui';
// import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { DocsAspect, DocsUI } from '@teambit/docs';
import { ComponentDeprecated } from '@teambit/component.ui.component-deprecated';
import { DeprecationAspect } from './deprecation.aspect';

export class DeprecationUIRuntime {
  static dependencies = [DocsAspect];

  static runtime = UIRuntime;

  static async provider([docsUI]: [DocsUI]) {
    docsUI.registerTitleBadge({
      component: function badge() {
        // console.log('-------------------------------------------');
        return <ComponentDeprecated />;
      },
      weight: 50,
    });
  }
}

DeprecationAspect.addRuntime(DeprecationUIRuntime);
