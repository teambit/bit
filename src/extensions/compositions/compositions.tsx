import React, { useContext, useState, useEffect } from 'react';
import { ComponentContext } from '../component/ui';
import { CompositionsPanel } from './ui/compositions-panel/compositions-panel';
import { ComponentComposition } from './ui';
import styles from './compositions.module.scss';

export function Compositions() {
  const component = useContext(ComponentContext);
  const [composition, setComposition] = useState(component.compositions[0]);
  // make sure to update state upon component model change.
  useEffect(() => {
    setComposition(component.compositions[0]);
  }, [component]);

  return (
    <div className={styles.compositionsPage}>
      <div className={styles.compositionPreview}>
        <ComponentComposition component={component} composition={composition}></ComponentComposition>
      </div>
      <CompositionsPanel onCompositionSelect={c => setComposition(c)} compositions={component.compositions} />
    </div>
  );
}
