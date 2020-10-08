import React, { useContext } from 'react';
import { ComponentComposition } from '@teambit/compositions';
import { Separator } from '@teambit/documenter.ui.separator';
import { ComponentCard } from '@teambit/explorer.ui.component-card';
import { ComponentGrid } from '@teambit/explorer.ui.component-grid';
import { ScopeDetails } from '@teambit/staged-components.scope-details';
import { ScopeContext } from '../scope-context';
import styles from './scope-overview.module.scss';
import { ScopeBadgeSlot } from '../../scope.ui.runtime';

export type ScopeOverviewProps = {
  badgeSlot: ScopeBadgeSlot;
};

export function ScopeOverview({ badgeSlot }: ScopeOverviewProps) {
  const scope = useContext(ScopeContext);
  const { components } = scope;

  return (
    <div className={styles.container}>
      <ScopeDetails
        scopeName={scope.name}
        badgeSlot={badgeSlot} // visibility should be extended by a slot registered by bit.dev
        description={scope.description}
      />
      <Separator />
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ComponentCard
                id={component.id.fullName}
                envIcon={component.environment?.icon}
                preview={<ComponentComposition component={component} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
