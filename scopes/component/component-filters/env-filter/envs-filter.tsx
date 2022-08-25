import React, { useMemo } from 'react';
import { MultiSelect, ItemType } from '@teambit/design.inputs.selectors.multi-select';
import { ComponentID, ComponentModel } from '@teambit/component';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import classNames from 'classnames';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { Link } from '@teambit/base-react.navigation.link';
import {
  ComponentFilterCriteria,
  ComponentFilterRenderProps,
  useComponentFilter,
} from '@teambit/component.ui.component-filters.component-filter-context';
import styles from './envs-filter.module.scss';

type EnvFilterEnvState = {
  active: boolean;
  icon?: string;
  displayName: string;
  id: string;
  description: string;
  componentId: ComponentID;
};
export type EnvFilterState = {
  envsState: Map<string, EnvFilterEnvState>;
  dropdownState: boolean;
};
export type EnvsFilterCriteria = ComponentFilterCriteria<EnvFilterState>;

export const EnvsFilter: EnvsFilterCriteria = {
  id: 'envs',
  match: ({ component }, filter) => {
    const { envsState } = filter;
    const activeEnvs = [...envsState.values()].filter((envState) => envState.active).map((envState) => envState.id);
    // match everything when no envs are set
    if (activeEnvs.length === 0) return true;
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

const getDefaultState = (components: ComponentModel[]) => {
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

function envsFilter({ components, className }: ComponentFilterRenderProps) {
  const defaultState = getDefaultState(components);
  const filterContext = useComponentFilter(EnvsFilter.id, defaultState);

  if (!filterContext) return null;

  const [currentFilter, updateFilter] = filterContext;

  const currentEnvsState = currentFilter.state.envsState;

  const selectList: ItemType[] = [];

  currentFilter.state.envsState.forEach((state) => {
    selectList.push({
      value: state.id,
      icon: state.icon,
      description: state.description,
      checked: !!currentEnvsState.get(state.id)?.active,
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

function EnvsDropdownItem({ displayName, icon, description, componentId, id }: EnvFilterEnvState) {
  return (
    <Tooltip
      placement="right"
      content={
        <Link
          className={styles.envLink}
          href={ComponentUrl.toUrl(componentId, { includeVersion: false })}
          external={true}
        >
          {id}
        </Link>
      }
    >
      <div className={styles.envDropdownItemContainer}>
        <div className={styles.envDropdownItem}>
          <Ellipsis>{displayName}</Ellipsis>
          <div className={styles.envDropdownItemIconContainer}>
            <img className={styles.envDropdownItemIcon} src={icon}></img>
          </div>
        </div>
        <div className={styles.description}>
          <Ellipsis className={styles.descriptionText}>{description}</Ellipsis>
        </div>
      </div>
    </Tooltip>
  );
}
