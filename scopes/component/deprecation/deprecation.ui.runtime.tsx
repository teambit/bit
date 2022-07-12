import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { ComponentModel } from '@teambit/component';
import { DocsAspect, DocsUI } from '@teambit/docs';
import { ComponentDeprecated } from '@teambit/component.ui.component-deprecated';
import { DeprecationAspect } from './deprecation.aspect';

export class DeprecationUIRuntime {
  static dependencies = [DocsAspect];

  static runtime = UIRuntime;

  static async provider([docsUI]: [DocsUI]) {
    docsUI.registerTitleBadge({
      component: function Badge({ legacyComponentModel }: { legacyComponentModel: ComponentModel }) {
        return <ComponentDeprecated deprecation={legacyComponentModel.deprecation} />;
      },
      weight: 40,
    });
  }
}

DeprecationAspect.addRuntime(DeprecationUIRuntime);
