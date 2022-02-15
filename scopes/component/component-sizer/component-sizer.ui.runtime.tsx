import React from 'react';
import { DocumentNode } from 'graphql';
import { gql } from '@apollo/client';
import { ComponentAspect, ComponentUI } from '@teambit/component';
import { UIRuntime } from '@teambit/ui';
import { DocsAspect, DocsUI } from '@teambit/docs';
import { ComponentSizerAspect } from './component-sizer.aspect';

/**
 * Component code tab aspect. Presents the code tab page and allows to control the code tab and register specific icons for each file type.
 *  @example CodeUI.registerEnvFileIcon([(fileName) => (/your-regexp/.test(fileName) ? 'your.icon.url' : undefined)])
 */
export class SizerUIRuntime {
  // constructor() {}
  static dependencies = [ComponentAspect, DocsAspect];

  static runtime = UIRuntime;

  static async provider([component, docs]: [ComponentUI, DocsUI]) {
    const sizer: DocumentNode = gql`
      fragment sizeFields on Component {
        size {
          compressedTotal
        }
      }
    `;
    component.registerComponentField(sizer);

    // docs.registerTitleBadge({component: () => <div>dsd</div>});
    const ui = new SizerUIRuntime();
    return ui;
  }
}

ComponentSizerAspect.addRuntime(SizerUIRuntime);
