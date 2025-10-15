import React, { useMemo, useEffect, useState } from 'react';
import classNames from 'classnames';
import type { ComponentModel } from '@teambit/component';
import { ComponentID } from '@teambit/component';
import type { ComponentFilterRenderProps } from '@teambit/component.ui.component-filters.component-filter-context';
import {
  useComponentFilter,
  useComponentFilters,
  runAllFilters,
} from '@teambit/component.ui.component-filters.component-filter-context';
import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
import { Dropdown, ButtonsPlugin } from '@teambit/design.inputs.dropdown';
import { EnvsPlaceholder, EnvsDropdownItem } from './dropdown-item';
import type { EnvsFilterCriteria, EnvFilterEnvState, ItemType } from './types';
import styles from './envs-filter.module.scss';

export const EnvsFilter: EnvsFilterCriteria = {
  id: 'envs',
  match: ({ component }, filter) => {
    const { envsState } = filter;
    const areAllEnvsActive = [...envsState.values()].every((envState) => envState.active);
    const activeEnvs = [...envsState.values()].filter((envState) => envState.active).map((envState) => envState.id);
    // match everything when no envs are set or all envs are set
    if (activeEnvs.length === 0 || areAllEnvsActive) return true;

    const envId =
      component.environment && ComponentID.tryFromString(component.environment.id)?.toStringWithoutVersion();

    const matches = !!envId && activeEnvs.indexOf(envId) >= 0;
    return matches;
  },
  state: {
    envsState: new Map<string, EnvFilterEnvState>(),
    dropdownState: false,
  },
  order: 1,
  render: envsFilter,
};

const deriveEnvsFilterState = (components: ComponentModel[]) => {
  return useMemo(() => {
    const defaultState = {
      dropdownState: false,
      envsState: new Map<string, EnvFilterEnvState>(),
    };

    const componentEnvSet = new Set<string>();

    const componentsEnvsWithIcons = components
      .filter((component) => {
        const envId = component.environment && ComponentID.tryFromString(component.environment.id);

        if (!envId) return false;

        const envKey = envId.toStringWithoutVersion();

        if (componentEnvSet.has(envKey)) return false;

        componentEnvSet.add(envKey);

        return true;
      })
      .map((component) => {
        const envId = ComponentID.fromString(component.environment?.id as string);
        return {
          displayName: envId.name,
          id: envId.toStringWithoutVersion(),
          description: `${envId.scope}${envId.namespace ? '/'.concat(envId.namespace) : ''}`,
          icon: component.environment?.icon,
          componentId: envId,
        };
      });

    componentsEnvsWithIcons.forEach((componentEnvWithIcon) => {
      defaultState.envsState.set(componentEnvWithIcon.id, { ...componentEnvWithIcon, active: true });
    });

    return defaultState;
  }, [components]);
};

function envsFilter({ components, className, lanes }: ComponentFilterRenderProps) {
  const [filters = []] = useComponentFilters() || [];
  const filtersExceptEnv = filters.filter((filter) => filter.id !== EnvsFilter.id);
  const filteredComponents = useMemo(
    () => runAllFilters(filtersExceptEnv, { components, lanes }),
    [JSON.stringify(filtersExceptEnv), lanes?.viewedLane?.id.toString()]
  );
  const envsFilterState = deriveEnvsFilterState(filteredComponents);
  const filterContext = useComponentFilter(EnvsFilter.id, envsFilterState);
  const envs = envsFilterState.envsState;
  const [currentFilter, updateFilter] = filterContext || [];
  const [open, setOpen] = useState(false);

  /**
   * this will not work if other filters in a single re-render
   * result in the same number of components with different ids
   */
  useEffect(() => {
    updateFilter?.((currentState) => {
      currentState.state = envsFilterState;
      return currentState;
    });
  }, [filteredComponents.length, lanes?.viewedLane?.id.toString()]);

  const selectList: ItemType[] = [];

  envs.forEach((state) => {
    selectList.push({
      value: state.id,
      icon: state.icon,
      description: state.description,
      checked: !!currentFilter?.state.envsState.get(state.id)?.active,
      element: <EnvsDropdownItem {...state} />,
    });
  });

  const onCheck = (value: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;

    updateFilter?.((currentState) => {
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
    updateFilter?.((currentState) => {
      currentState.state.envsState.forEach((value, key) => {
        currentState.state.envsState.set(key, { ...value, active: false });
      });
      return currentState;
    });
  };

  const onSubmit = () => {
    updateFilter?.((currentState) => {
      currentState.state.dropdownState = false;
      return currentState;
    });
    setOpen(false);
  };

  return (
    <div className={classNames(styles.envsFilterContainer, className)}>
      <Dropdown
        open={open}
        onClickOutside={() => setOpen(false)}
        placeholderContent={<EnvsPlaceholder onClick={() => setOpen(!open)} />}
        bottomPlugin={<ButtonsPlugin onClear={onClear} onSubmit={onSubmit} submitClassName={styles.doneButton} />}
        dropClass={styles.envFilterDropdown}
        position="bottom"
      >
        <div className={styles.dropdownContent}>
          {selectList.map((option, index) => (
            <CheckboxItem key={index} checked={option.checked} onInputChanged={(e) => onCheck(option.value, e)}>
              {option.element}
            </CheckboxItem>
          ))}
        </div>
      </Dropdown>
    </div>
  );
}
