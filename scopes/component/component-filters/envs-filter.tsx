import React, { useContext } from 'react';
import { MultiSelect } from '@teambit/design.inputs.selectors.multi-select';
import { ComponentModel } from '@teambit/component';
import classNames from 'classnames';
import { ComponentFilterContext, ComponentFilterCriteria } from './component-filters.context';
import styles from './envs-filter.module.scss';

export type EnvFilterState = { active: boolean; icon?: string; displayName: string; id: string };
export type EnvsFilterCriteria = ComponentFilterCriteria<Map<string, EnvFilterState>>;

export const EnvsFilter: EnvsFilterCriteria = {
  id: 'envs',
  match: (component, state) => {
    const activeEnvs = [...state.values()].filter((envState) => envState.active).map((envState) => envState.id);
    // match everything when no envs are set
    if (activeEnvs.length === 0) return true;
    const matches = Boolean(component.environment?.id && activeEnvs.indexOf(component.environment?.id) >= 0);
    return matches;
  },
  state: new Map<string, EnvFilterState>(),
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

  if (!currentFilter) return null;

  const componentEnvSet = new Set<string>();
  const componentsEnvsWithIcons = components
    .filter((component) => {
      if (!component.environment?.id) return false;

      if (componentEnvSet.has(component.environment.id)) return false;
      componentEnvSet.add(component.environment.id);
      return true;
    })
    .map((component) => ({
      displayName: component.environment?.id.split('/').pop() || (component.environment?.id as string),
      id: component.environment?.id as string,
      icon: component.environment?.icon,
    }));

  const selectList = componentsEnvsWithIcons.map((filter) => {
    return {
      value: filter.displayName,
      icon: filter.icon,
      checked: Boolean(currentFilter.state.get(filter.id)?.active),
    };
  });

  const onCheck = (value: string, checked: boolean) => {
    const matchingEnv = componentsEnvsWithIcons.find((c) => c.displayName === value);

    if (!matchingEnv) return;

    const currentState = currentFilter.state.get(matchingEnv.id) || matchingEnv;

    currentFilter.state.set(matchingEnv.id, { ...currentState, active: checked });

    updateFilter(currentFilter);
  };

  const onClear = () => {
    currentFilter.state.forEach((value, key) => {
      currentFilter.state.set(key, { ...value, active: false });
    });
    updateFilter(currentFilter);
  };

  return (
    <div className={classNames(styles.envsFilterContainer, className)}>
      <MultiSelect
        itemsList={selectList}
        placeholderText={'Environments'}
        onSubmit={() => {}}
        onCheck={onCheck}
        onClear={onClear}
      />
    </div>
  );
}
