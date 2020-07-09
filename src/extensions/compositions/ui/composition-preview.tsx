import React from 'react';
import { ComponentPreview } from '../../preview/ui';
import { ComponentModel } from '../../component/ui';
import { Composition } from '../composition';

export type ComponentCompositionProps = {
  component: ComponentModel;
  composition?: Composition;
};

export function ComponentComposition({ component, composition }: ComponentCompositionProps) {
  if (!component?.server?.url) {
    return <div>No compositions to show</div>;
  }

  return (
    <ComponentPreview
      component={component}
      style={{ width: '100%', height: '100%' }}
      previewName="compositions"
      queryParams={composition && composition.identifier}
    />
  );
}
