import React, { useContext } from 'react';
import { ComponentContext } from '../../component/ui';

export function ComponentSimulation() {
  const component = useContext(ComponentContext);

  return <div>{component.id}</div>;
}
