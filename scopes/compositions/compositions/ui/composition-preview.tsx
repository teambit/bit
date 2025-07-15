import React, { useMemo } from 'react';
import { ComponentPreview, ComponentPreviewProps } from '@teambit/preview.ui.component-preview';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';

import { Composition } from '../composition';

export type ComponentCompositionProps = {
  /**
   * composition to use for component rendering.
   */
  composition?: Composition;
} & ComponentPreviewProps;

export function ComponentComposition({ composition, component, queryParams = [], ...rest }: ComponentCompositionProps) {
  const { isMinimal } = useWorkspaceMode();
  const includesEnvTemplate = component.preview?.includesEnvTemplate;
  const isScaling = component.preview?.isScaling;
  const shouldAddNameParam = component.preview?.useNameParam || (isScaling && includesEnvTemplate === false);

  const compositionParams = useMemo(
    () =>
      (composition ? [shouldAddNameParam ? `name=${composition.identifier}` : composition.identifier] : []).concat(
        queryParams
      ),
    [composition?.identifier, queryParams]
  );

  return (
    <ComponentPreview
      {...rest}
      component={component}
      style={{ width: '100%', height: '100%' }}
      previewName="compositions"
      queryParams={compositionParams}
      propagateError={isMinimal}
    />
  );
}
