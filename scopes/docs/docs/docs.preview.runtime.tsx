import React, { ReactNode } from 'react';
import { PreviewAspect, RenderingContext, PreviewPreview, PreviewRuntime, PreviewModule } from '@teambit/preview';
import { ComponentID } from '@teambit/component-id';

import { DocsAspect } from './docs.aspect';
import type { Docs } from './docs';

export type DocsRootProps = {
  Provider: React.ComponentType | undefined;
  componentId: string;
  docs: Docs | undefined;
  compositions: any;
  context: RenderingContext;
};

export class DocsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewPreview
  ) {}

  render = (
    componentId: ComponentID,
    envId: string,
    modules: PreviewModule,
    [compositions]: [any],
    context: RenderingContext
  ) => {
    const docsModule = this.selectPreviewModel(componentId.fullName, modules);

    const mainModule = modules.modulesMap[envId] || modules.modulesMap.default;
    const defaultExports = mainModule.default;
    const isObject = !!defaultExports.apiObject;

    /**
     * for backwards compatibility - can be removed end of 2022
     */
    if (!isObject) {
      const docsPropsArray = [
        NoopProvider as React.ComponentType,
        componentId.toString(),
        docsModule as Docs,
        compositions,
        context,
      ];
      defaultExports(...docsPropsArray);
      return;
    }

    const docsProps: DocsRootProps = {
      Provider: NoopProvider as React.ComponentType,
      componentId: componentId.toString(),
      docs: docsModule as Docs,
      compositions,
      context,
    };

    defaultExports(docsProps);
  };

  selectPreviewModel(componentId: string, modules: PreviewModule) {
    const relevant = modules.componentMap[componentId];
    if (!relevant) return undefined;

    // only one doc file is supported.
    return relevant[0];
  }

  static runtime = PreviewRuntime;
  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview]) {
    const docsPreview = new DocsPreview(preview);
    preview.registerPreview({
      name: 'overview',
      render: docsPreview.render.bind(docsPreview),
      selectPreviewModel: docsPreview.selectPreviewModel.bind(docsPreview),
      include: ['compositions'],
    });

    return docsPreview;
  }
}

DocsAspect.addRuntime(DocsPreview);

function NoopProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
