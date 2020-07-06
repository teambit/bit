import gql from 'graphql-tag';
import React, { useContext, useState } from 'react';
import { ComponentContext } from '../component/ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { ComponentComposition } from './ui';

// export const COMPOSITIONS_SUBSCRIPTION = gql`
// `;

export function Compositions() {
  const component = useContext(ComponentContext);
  const [composition, setComposition] = useState(component.compositions[0]);

  return (
    <div>
      <CompositionsPanel onCompositionSelect={c => setComposition(c)} compositions={component.compositions} />
      <ComponentComposition component={component} composition={composition}></ComponentComposition>
    </div>
  );
}
