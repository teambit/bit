import React, { useContext, useEffect } from 'react';
import { MultiSelect } from '@teambit/design.inputs.selectors.multi-select';
import { ComponentModel } from '@teambit/component';
import classNames from 'classnames';
import { ComponentFilterContext, ComponentFilterCriteria } from './component-filters.context';
import styles from './envs-filter.module.scss';

export type EnvFilterState = {
  envsState: Map<string, { active: boolean; icon?: string; displayName: string; id: string }>;
  dropdownState?: boolean;
};
export type EnvsFilterCriteria = ComponentFilterCriteria<EnvFilterState>;

export const EnvsFilter: EnvsFilterCriteria = {
  id: 'envs',
  match: (component, state) => {
    const { envsState } = state;
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

function envsFilter({
  components,
  className,
}: { components: ComponentModel[] } & React.HTMLAttributes<HTMLDivElement>) {
  const { filters, updateFilter } = useContext(ComponentFilterContext);
  const currentFilter = filters.find((activeFilter) => activeFilter.id === EnvsFilter.id) as
    | EnvsFilterCriteria
    | undefined;

  const componentEnvSet = new Set<string>();
  const componentsEnvsWithIcons = components
    .filter((component) => {
      if (!component.environment?.id || componentEnvSet.has(component.environment.id)) return false;

      componentEnvSet.add(component.environment.id);
      return true;
    })
    .map((component) => ({
      displayName: component.environment?.id.split('/').pop() || (component.environment?.id as string),
      id: component.environment?.id as string,
      icon: component.environment?.icon,
    }));

  // run only for the first time when the component mounts
  useEffect(() => {
    if (currentFilter) {
      // set initial state of the dropdown to have all possible options checked
      componentsEnvsWithIcons.forEach((componentEnvWithIcon) => {
        currentFilter.state.envsState.set(componentEnvWithIcon.id, { ...componentEnvWithIcon, active: true });
      });
      updateFilter(currentFilter);
    }
  }, []);

  if (!currentFilter) return null;

  const currentEnvsState = currentFilter.state.envsState;

  const selectList = componentsEnvsWithIcons.map((filter) => {
    return {
      value: filter.displayName,
      icon: filter.icon,
      checked: Boolean(currentEnvsState.get(filter.id)?.active),
    };
  });

  const onCheck = (value: string, checked: boolean) => {
    const matchingEnv = componentsEnvsWithIcons.find((c) => c.displayName === value);

    if (!matchingEnv) return;

    const currentState = currentEnvsState.get(matchingEnv.id) || matchingEnv;

    currentEnvsState.set(matchingEnv.id, { ...currentState, active: checked });
    if (checked && !currentFilter.state.dropdownState) {
      currentFilter.state.dropdownState = true;
    }
    updateFilter(currentFilter);
  };

  const onClear = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.stopPropagation();
    currentEnvsState.forEach((value, key) => {
      currentEnvsState.set(key, { ...value, active: false });
    });
    updateFilter(currentFilter);
  };

  const onSubmit = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.stopPropagation();
    currentFilter.state.dropdownState = false;
    updateFilter(currentFilter);
  };

  const onDropdownClicked = () => {
    currentFilter.state.dropdownState = !currentFilter.state.dropdownState;
    updateFilter(currentFilter);
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
