import React, { useContext } from 'react';
import { ComponentContext } from '@teambit/component/ui';
import { ComponentPreview } from '@teambit/preview/ui';

export function Overview() {
  const component = useContext(ComponentContext);

  return <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
}
