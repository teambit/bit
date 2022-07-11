import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { ComponentModel } from '@teambit/component';
import { DocsAspect, DocsUI } from '@teambit/docs';
import { ComponentSize } from '@teambit/component.ui.component-size';
import { ComponentSizerAspect } from './component-sizer.aspect';

/**
 * Component size aspect.
 */
export class SizerUIRuntime {
  static dependencies = [DocsAspect];

  static runtime = UIRuntime;

  static async provider([docs]: [DocsUI]) {
    docs.registerTitleBadge([
      {
        component: function badge({ legacyComponentModel }: { legacyComponentModel: ComponentModel }) {
          return <ComponentSize legacyComponentModel={legacyComponentModel} />;
        },
        weight: 30,
      },
    ]);
  }
}

ComponentSizerAspect.addRuntime(SizerUIRuntime);
