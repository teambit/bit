import React, { useContext } from 'react';
import { MultiSelect } from '@teambit/design.inputs.selectors.multi-select';
import { ComponentModel } from '@teambit/component';
import classNames from 'classnames';
import { ComponentFilterContext, ComponentFilterCriteria } from './component-filters.context';
import styles from './envs-filter.module.scss';

export type EnvFilterState = { active: boolean; icon?: string; env: string };
export type EnvsFilterCriteria = ComponentFilterCriteria<Map<string, EnvFilterState>>;

export const EnvsFilter: EnvsFilterCriteria = {
  id: 'envs',
  match: (component, state) => {
    const activeEnvs = [...state.values()].filter((envState) => envState.active).map((envState) => envState.env);
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
    .map((component) => ({ env: component.environment?.id as string, icon: component.environment?.icon }));

  const selectList = componentsEnvsWithIcons.map((filter) => ({
    value: filter.env,
    icon: filter.icon,
    checked: Boolean(currentFilter.state.get(filter.env)?.active),
  }));

  const onCheck = (env: string, checked: boolean) => {
    const currentState = currentFilter.state.get(env) || {
      env,
      icon: componentsEnvsWithIcons.find((c) => c.env === env)?.icon,
      active: checked,
    };

    currentFilter.state.set(env, { ...currentState, active: checked });
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
