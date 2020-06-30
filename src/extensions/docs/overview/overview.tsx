import React, { useContext } from 'react';
import { ComponentContext } from '../../component/ui';
import { ComponentPreview } from '../../preview/ui';

export function Overview() {
  const component = useContext(ComponentContext);

  return <ComponentPreview component={component} style={{ width: '100%', height: '100%' }} previewName="overview" />;
}
