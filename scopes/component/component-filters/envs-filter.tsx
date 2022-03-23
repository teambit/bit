import React from 'react';
import { MultiSelect, ItemType } from '@teambit/design.inputs.selectors.multi-select';
import { ComponentModel } from '@teambit/component';
import classNames from 'classnames';
import { ComponentFilterCriteria, useComponentFilter } from './component-filters.context';
import styles from './envs-filter.module.scss';

export type EnvFilterState = {
  envsState: Map<string, { active: boolean; icon?: string; displayName: string; id: string }>;
  dropdownState?: boolean;
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
  },
  order: 1,
  render: envsFilter,
};

const mapToEnvDisplayName = (component: ComponentModel) =>
  component.environment?.id.split('/').pop() || (component.environment?.id as string);

const getDefaultState = (components: ComponentModel[]) => {
  const defaultState = {
    envsState: new Map<string, { active: boolean; icon?: string; displayName: string; id: string }>(),
  };
  const componentEnvSet = new Set<string>();
  const componentsEnvsWithIcons = components
    .filter((component) => {
      if (!component.environment?.id || componentEnvSet.has(component.environment.id)) return false;

      componentEnvSet.add(component.environment.id);
      return true;
    })
    .map((component) => ({
      displayName: mapToEnvDisplayName(component),
      id: component.environment?.id as string,
      icon: component.environment?.icon,
    }));
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
    });
  });

  const onCheck = (value: string, checked: boolean) => {
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

  const onClear = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.stopPropagation();

    updateFilter((currentState) => {
      currentState.state.envsState.forEach((value, key) => {
        currentState.state.envsState.set(key, { ...value, active: false });
      });
      return currentState;
    });
  };

  const onSubmit = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.stopPropagation();
    updateFilter((currentState) => {
      currentState.state.dropdownState = false;
      return currentState;
    });
  };

  const onDropdownClicked = (event) => {
    event.stopPropagation();
    updateFilter((currentState) => {
      currentState.state.dropdownState = !currentFilter.state.dropdownState;
      return currentState;
    });
  };

  return (
    <div className={classNames(styles.envsFilterContainer, className)}>
      <div className={styles.filterIcon}>
        <img src="https://static.bit.dev/bit-icons/env.svg" />
      </div>
      <MultiSelect
        itemsList={selectList}
        placeholderText={'Environments'}
        onSubmit={onSubmit}
        onCheck={onCheck}
        onClear={onClear}
        open={currentFilter.state.dropdownState}
        onClick={onDropdownClicked}
        dropdownBorder={false}
        className={styles.envFilterDropdownContainer}
        dropClass={styles.envFilterDropdown}
      />
    </div>
  );
}
