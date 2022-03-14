import classNames from 'classnames';
import React, { useContext } from 'react';
import { Toggle } from '@teambit/design.ui.input.toggle';
import { ComponentFilterContext, ComponentFilterCriteria } from './component-filters.context';
import styles from './deprecate-filter.module.scss';

export type DeprecateFilterCriteria = ComponentFilterCriteria<boolean>;

export const DeprecateFilter: DeprecateFilterCriteria = {
  id: 'deprecate',
  match: (component, state) => state || !component.deprecation?.isDeprecate,
  state: false,
  order: 0,
  render: deprecateFilter,
};

function deprecateFilter({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const { filters, updateFilter } = useContext(ComponentFilterContext);

  const currentFilter = filters.find((activeFilter) => activeFilter.id === DeprecateFilter.id) as
    | DeprecateFilterCriteria
    | undefined;

  if (!currentFilter) return null;

  const isActive = currentFilter.state;

  return (
    <div className={classNames(styles.deprecateFilter, isActive && styles.active, className)}>
      <div className={styles.filterIcon}>
        <img src="https://static.bit.dev/bit-icons/deprecated.svg" />
        <span className={styles.filterIconLabel}>Deprecated</span>
      </div>
      <div>
        <Toggle
          checked={isActive}
          onInputChanged={() => updateFilter({ ...currentFilter, state: !currentFilter.state })}
        />
      </div>
    </div>
  );
}
