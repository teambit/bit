import classNames from 'classnames';
import React from 'react';
import { Toggle } from '@teambit/design.ui.input.toggle';
import {
  ComponentFilterCriteria,
  useComponentFilter,
} from '@teambit/component.ui.component-filters.component-filter-context';
import styles from './deprecate-filter.module.scss';

export type DeprecateFilterCriteria = ComponentFilterCriteria<boolean>;

export const DeprecateFilter: DeprecateFilterCriteria = {
  id: 'deprecate',
  match: (component, active) => active || !component.deprecation?.isDeprecate,
  state: false,
  order: 0,
  render: deprecateFilter,
};

function deprecateFilter({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const filterContext = useComponentFilter(DeprecateFilter);

  if (!filterContext) return null;

  const [filter, updateFilter] = filterContext;

  const isActive = filter.state;

  return (
    <div className={classNames(styles.deprecateFilter, isActive && styles.active, className)}>
      <div className={styles.filterIcon}>
        <img src="https://static.bit.dev/bit-icons/deprecated.svg" />
        <span className={styles.filterIconLabel}>Deprecated</span>
      </div>
      <div>
        <Toggle
          checked={isActive}
          onInputChanged={() => updateFilter((currentState) => ({ ...currentState, state: !isActive }))}
        />
      </div>
    </div>
  );
}
