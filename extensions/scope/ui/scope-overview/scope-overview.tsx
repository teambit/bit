import { ComponentComposition } from '@teambit/compositions';
import { Separator } from '@teambit/documenter.ui.separator';
import { ComponentCard } from '@teambit/explorer.ui.component-card';
import { ComponentGrid } from '@teambit/explorer.ui.component-grid';
import { ScopeDetails } from '@teambit/staged-components.scope-details';
import React, { useContext } from 'react';

import { ScopeContext } from '../scope-context';
import styles from './scope-overview.module.scss';

// TODO - @oded - remove mock data once we get real data
const scopeTitleMock = {
  org: 'google',
  scopeName: 'material-ui',
  visibility: 'public',
  license: 'mit',
  subtitle:
    'Radio Buttons are graphical interface elements that allow user to choose only one of a predefined set of mutually exclusive options.',
  contributors: [
    {
      profileImage:
        'https://s.gravatar.com/avatar/bbf80ff958de61ef617fc3f884eac875?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/fe62d760ae2e7c7ef010102c009600c3?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/18753b52208563aa388239347f22c721?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
    },
    {
      profileImage:
        'https://s.gravatar.com/avatar/73b1eb2c6b5acfe3f196b19d70f1a902?rating=g&default=blank&size=35&w=35&h=35&fill=fillmax&bg=fff',
    },
  ],
};

export function ScopeOverview() {
  const data = useContext(ScopeContext);
  const { components } = data;
  return (
    <div className={styles.container}>
      <ScopeDetails {...scopeTitleMock} />
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
