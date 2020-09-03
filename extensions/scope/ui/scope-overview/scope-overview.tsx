import React, { useContext } from 'react';
import { ComponentComposition } from '@teambit/compositions';
import { Separator } from '@teambit/documenter.ui.separator';
import { ComponentCard } from '@teambit/explorer.ui.component-card';
import { ComponentGrid } from '@teambit/explorer.ui.component-grid';
import { ScopeDetails } from '@teambit/staged-components.scope-details';
import { ScopeContext } from '../scope-context';
import styles from './scope-overview.module.scss';

export function ScopeOverview() {
  const scope = useContext(ScopeContext);
  const { components } = scope;
  const { owner, name } = scope.parseName();
  return (
    <div className={styles.container}>
      <ScopeDetails
        owner={owner} // should be refactored to use ScopeID.
        scopeName={name} // should be refactored to use ScopeID.
        visibility="private" // visibility should be extended by a slot registered by bit.dev
        license="MIT" // refactor to be in license aspect and expose through a slot.
        contributors={[]} // should be provided by bit.dev
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
