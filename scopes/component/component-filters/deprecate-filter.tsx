import classNames from 'classnames';
import React, { useContext } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Toggle } from '@teambit/design.ui.input.toggle';
import { ComponentFilterContext, DeprecateFilterCriteria } from './component-filters.context';
import styles from './deprecate-filter.module.scss';

export const DeprecateFilter: DeprecateFilterCriteria = {
  id: 'deprecate',
  match: (component, _this) => _this.state || !component.deprecation?.isDeprecate,
  state: false,
  alwaysRunMatch: true,
  order: 0,
  render: () => {
    const { filters, updateFilter } = useContext(ComponentFilterContext);
    const currentFilter = filters.find((activeFilter) => activeFilter.id === DeprecateFilter.id) as
      | DeprecateFilterCriteria
      | undefined;

    if (!currentFilter) return null;

    const isActive = currentFilter.state;

    return (
      <div className={classNames(styles.deprecateFilter, isActive && styles.active)}>
        <div className={styles.filterIcon}>
          <Icon of="note-deprecated" />
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
  },
};
