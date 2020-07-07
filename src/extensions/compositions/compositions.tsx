import gql from 'graphql-tag';
import React, { useContext, useState } from 'react';
import { ComponentContext } from '../component/ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { ComponentComposition } from './ui';
import styles from './compositions.module.scss';
// export const COMPOSITIONS_SUBSCRIPTION = gql`
// `;

export function Compositions() {
  const component = useContext(ComponentContext);
  const [composition, setComposition] = useState(component.compositions[0]);

  return (
    <div className={styles.compositionsPage}>
      <ComponentComposition component={component} composition={composition}></ComponentComposition>
      <CompositionsPanel onCompositionSelect={c => setComposition(c)} compositions={component.compositions} />
    </div>
  );
}
