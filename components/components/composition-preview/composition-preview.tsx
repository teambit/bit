import { ComponentModel } from 'bit-bin/dist/extensions/component';
import { Composition } from 'bit-bin/dist/extensions/compositions';
import { ComponentPreview } from 'bit-bin/dist/extensions/preview';
import React from 'react';

export type ComponentCompositionProps = {
  component: ComponentModel;
  composition?: Composition;
};

export function ComponentComposition({ component, composition }: ComponentCompositionProps) {
  return (
    <ComponentPreview
      component={component}
      style={{ width: '100%', height: '100%' }}
      previewName="compositions"
      queryParams={(composition && composition.identifier) || ''}
    />
  );
}
