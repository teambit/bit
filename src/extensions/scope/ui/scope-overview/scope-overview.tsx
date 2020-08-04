import React, { useContext } from 'react';
import { ComponentGrid } from '@teambit/explorer-temp.ui.component-grid';
import { ComponentCard } from '@teambit/explorer-temp.ui.component-card';
import { ComponentComposition } from '../../../../extensions/compositions/ui';
import { ScopeContext } from '../scope-context';
import styles from './scope-overview.module.scss';

export function ScopeOverview() {
  const data = useContext(ScopeContext);
  const { components } = data;
  return (
    <div className={styles.container}>
      {/* <ScopeHero></ScopeHero> */}
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ComponentCard
                id={component.id.fullName}
                size={14093}
                preview={<ComponentComposition component={component} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
