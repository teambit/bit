import React, { useMemo } from 'react';
import { MultiSelect, ItemType } from '@teambit/design.inputs.selectors.multi-select';
import { ComponentID, ComponentModel } from '@teambit/component';
import classNames from 'classnames';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { Descriptor } from '@teambit/envs';
import { ComponentFilterCriteria, useComponentFilter } from './component-filters.context';
import styles from './envs-filter.module.scss';

export type EnvFilterState = {
  envsState: Map<string, { active: boolean; icon?: string; displayName: string; id: string }>;
  dropdownState: boolean;
};
export type EnvsFilterCriteria = ComponentFilterCriteria<EnvFilterState>;

export const EnvsFilter: EnvsFilterCriteria = {
  id: 'envs',
  match: (component, filter) => {
    const { envsState } = filter;
    const activeEnvs = [...envsState.values()].filter((envState) => envState.active).map((envState) => envState.id);
    // match everything when no envs are set
    if (activeEnvs.length === 0) return true;
    const matches = Boolean(component.environment?.id && activeEnvs.indexOf(component.environment?.id) >= 0);
    return matches;
  },
  state: {
    envsState: new Map<string, { active: boolean; icon?: string; displayName: string; id: string }>(),
    dropdownState: false,
  },
  order: 1,
  render: envsFilter,
};

const mapToEnvDisplayName = (componentDescriptor: Descriptor) => ComponentID.fromString(componentDescriptor.id).name;

const getDefaultState = (components: ComponentModel[]) => {
  const defaultState = {
    dropdownState: false,
    envsState: new Map<string, { active: boolean; icon?: string; displayName: string; id: string }>(),
  };
  const componentsEnvsWithIcons = useMemo(() => {
    const componentEnvSet = new Set<string>();
    return components
      .filter((component) => {
        if (!component.environment) return false;
        const displayName = mapToEnvDisplayName(component.environment);
        if (componentEnvSet.has(displayName)) return false;

        componentEnvSet.add(displayName);
        return true;
      })
      .map((component) => ({
        displayName: mapToEnvDisplayName(component.environment as Descriptor),
        id: ComponentID.fromString(component.environment?.id as string).toStringWithoutVersion(),
        icon: component.environment?.icon,
      }));
  }, [components]);
  componentsEnvsWithIcons.forEach((componentEnvWithIcon) => {
    defaultState.envsState.set(componentEnvWithIcon.displayName, { ...componentEnvWithIcon, active: true });
  });
  return defaultState;
};

function envsFilter({
  components,
  className,
}: { components: ComponentModel[] } & React.HTMLAttributes<HTMLDivElement>) {
  const defaultState = getDefaultState(components);
  const filterContext = useComponentFilter(EnvsFilter, defaultState);

  if (!filterContext) return null;

  const [currentFilter, updateFilter] = filterContext;

  const currentEnvsState = currentFilter.state.envsState;

  const selectList: ItemType[] = [];

  currentFilter.state.envsState.forEach((state) => {
    selectList.push({
      value: state.displayName,
      icon: state.icon,
      checked: !!currentEnvsState.get(state.displayName)?.active,
      element: <EnvsDropdownItem {...state} />,
    });
  });

  const onCheck = (value: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;

    updateFilter((currentState) => {
      if (checked && !currentState.state.dropdownState) {
        currentState.state.dropdownState = true;
      }

      const currentEnvState = currentState.state.envsState.get(value);
      if (!currentEnvState) return currentState;

      currentState.state.envsState.set(value, { ...currentEnvState, active: checked });
      return currentState;
    });
  };

  const onClear = () => {
    updateFilter((currentState) => {
      currentState.state.envsState.forEach((value, key) => {
        currentState.state.envsState.set(key, { ...value, active: false });
      });
      return currentState;
    });
  };

  const onSubmit = () => {
    updateFilter((currentState) => {
      currentState.state.dropdownState = false;
      return currentState;
    });
  };

  const onDropdownToggled = (event, open) => {
    updateFilter((currentState) => {
      currentState.state.dropdownState = open;
      return currentState;
    });
  };

  return (
    <div className={classNames(styles.envsFilterContainer, className)}>
      <MultiSelect
        itemsList={selectList}
        placeholder={<EnvsPlaceholder />}
        onSubmit={onSubmit}
        onCheck={onCheck}
        onClear={onClear}
        onChange={onDropdownToggled}
        open={currentFilter.state.dropdownState}
        dropdownBorder={false}
        className={styles.envFilterDropdownContainer}
        dropClass={styles.envFilterDropdown}
      />
    </div>
  );
}

function EnvsPlaceholder() {
  return (
    <div className={styles.filterIcon}>
      <img src="https://static.bit.dev/bit-icons/env.svg" />
      <span className={styles.filterIconLabel}>Environments</span>
      <div className={styles.dropdownArrow}>
        <img src="https://static.bit.dev/bit-icons/fat-arrow-down.svg" />
      </div>
    </div>
  );
}

function EnvsDropdownItem({
  displayName,
  id,
  icon,
}: {
  active: boolean;
  icon?: string;
  displayName: string;
  id: string;
}) {
  return (
    <Tooltip placement="right" content={id}>
      <div className={styles.envDropdownItem}>
        <Ellipsis>{`${displayName}`}</Ellipsis>
        <img className={styles.envDropdownItemIcon} src={icon}></img>
      </div>
    </Tooltip>
  );
}
