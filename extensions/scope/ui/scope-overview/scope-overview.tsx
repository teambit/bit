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

  const contributors = [
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
      name: 'oded',
    },
  ];
  return (
    <div className={styles.container}>
      <ScopeDetails
        owner={owner} // should be refactored to use ScopeID.
        scopeName={name} // should be refactored to use ScopeID.
        visibility="private" // visibility should be extended by a slot registered by bit.dev
        license="MIT" // refactor to be in license aspect and expose through a slot.
        contributors={contributors} // should be provided by bit.dev
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
