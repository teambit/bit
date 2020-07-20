import React from 'react';
import classNames from 'classnames';
import R from 'ramda';
import { ComponentGrid } from '@bit/bit.explorer.ui.component-grid';
import { ComponentCard } from '@bit/bit.explorer.ui.component-card';
import { ComponentComposition } from '../../../../compositions/ui';
import styles from './workspace-grid.module.scss';

export type WorkspaceComponentGridProps = {
  components: any[];
};

export function WorkspaceComponentGrid({ components }: WorkspaceComponentGridProps) {
  // hack to limit the size of the components when there are only a few components
  const limitWidth = components.length < 3;
  return (
    <div className={classNames(styles.container, { [styles.limitLength]: limitWidth })}>
      <ComponentGrid>
        {components.map((component, index) => {
          const compositions = R.path(['compositions'], component);
          return (
            <div key={index}>
              <ComponentCard
                id={R.path(['legacyComponentId', 'name'], component)}
                size={14093}
                description="Base title component, to be styled by composing components sjkdhlkjdf sdjkhflksjdf jksdhfl."
              />
              {compositions && compositions.length > 0 && (
                <ComponentComposition component={component} composition={compositions[0]} />
              )}
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
