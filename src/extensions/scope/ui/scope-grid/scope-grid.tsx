import React, { useContext } from 'react';
import R from 'ramda';
import { ComponentGrid } from '@bit/bit.explorer.ui.component-grid';
import { ComponentCard } from '@bit/bit.explorer.ui.component-card';
// import { ComponentComposition } from '../../../../extensions/compositions/ui';
import { ScopeContext } from '../scope-context';
import styles from './scope-grid.module.scss';

export function ScopeComponentGrid() {
  const data = useContext(ScopeContext);
  const { components } = data;
  return (
    <div className={styles.container}>
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ComponentCard
                id={R.path(['id', 'fullName'], component)}
                size={14093}
                // preview={<ComponentComposition component={component} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
