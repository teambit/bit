import React, { useContext } from 'react';
import { ComponentContext } from '../../component/ui';

export function Overview() {
  const component = useContext(ComponentContext);

  return <iframe style={{ width: '100%', height: '100%' }} src={component.server.url} />;
}
