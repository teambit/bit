import React from 'react';
import { ToggleButton } from '@teambit/design.inputs.toggle-button';
import { Icon } from '@teambit/design.elements.icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { MultiSelect } from '@teambit/design.inputs.selectors.multi-select';
import styles from './compare-toolbar.module.scss';

export type DiffMode = 'split' | 'unified';

export type CompareViewMode = {
  id: string;
  displayName: string;
  icon?: string;
};

export type CompareGroupByOption = {
  value: string;
  label: string;
};

type SelectOption = { value: string; payload: string };

export type CompareToolbarProps = {
  viewMode: string;
  onViewModeChange: (mode: string) => void;
  groupBy?: string;
  onGroupByChange?: (groupBy: string) => void;
  diffMode: DiffMode;
  onDiffModeChange: (mode: DiffMode) => void;
  viewModes: CompareViewMode[];
  groupByOptions?: CompareGroupByOption[];
  counts: Record<string, number>;
  /**
   * Show the per-view-mode count badge. Counts always drive visibility (a mode with count 0 is
   * hidden); this only controls the badge. Off for single-component compare, where a count would
   * only ever be "1 component" and reads as meaningless.
   */
  showCounts?: boolean;
  loading?: boolean;
  componentOptions?: SelectOption[];
  selectedComponents?: SelectOption[];
  onSelectedComponentsChange?: (selected: SelectOption[]) => void;
  searchPlaceholder?: string;
  className?: string;
  sidebarWidth?: number;
};

const searchSelectStyles = {
  control: () => ({
    fontSize: '13px',
    padding: '2px 4px',
    height: '32px',
    width: '100%',
  }),
  singleValue: () => ({
    padding: 0,
  }),
};

export function CompareToolbar({
  viewMode,
  onViewModeChange,
  groupBy,
  onGroupByChange,
  diffMode,
  onDiffModeChange,
  counts,
  showCounts = true,
  loading,
  viewModes: registeredViewModes,
  groupByOptions,
  componentOptions,
  selectedComponents,
  onSelectedComponentsChange,
  searchPlaceholder = 'Search components',
  className,
  sidebarWidth,
}: CompareToolbarProps) {
  const viewModes = registeredViewModes
    .map((vm) => ({
      value: vm.id,
      label: vm.displayName,
      icon: vm.icon,
      count: counts[vm.id] ?? 0,
    }))
    .filter((vm) => vm.count > 0);

  const hasGroupBy = !!(groupByOptions && groupByOptions.length > 0 && onGroupByChange);
  const groupByIndex = hasGroupBy
    ? Math.max(
        0,
        (groupByOptions as CompareGroupByOption[]).findIndex((g) => g.value === groupBy)
      )
    : 0;
  const viewModeIndex = viewModes.findIndex((v) => v.value === viewMode);

  return (
    <div
      className={`${styles.toolbar}${className ? ` ${className}` : ''}`}
      style={sidebarWidth ? ({ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties) : undefined}
    >
      {componentOptions && onSelectedComponentsChange && (
        <div className={styles.toolbarSearch}>
          <MultiSelect
            id="search-components"
            styles={searchSelectStyles}
            placeholder={searchPlaceholder}
            options={componentOptions}
            activeOptions={selectedComponents || []}
            onChange={(value) => onSelectedComponentsChange(value || [])}
            className={styles.componentSearchSelect}
          />
        </div>
      )}
      <div className={styles.toolbarLeft}>
        <ToggleButton
          onOptionSelect={(idx) => {
            const newMode = viewModes[idx].value;
            onViewModeChange(newMode);
          }}
          defaultIndex={viewModeIndex >= 0 ? viewModeIndex : 0}
          options={viewModes.map((vm) => ({
            value: vm.value,
            element: (
              <div className={styles.toolbarOption}>
                {vm.icon && <Icon of={vm.icon} />}
                <span>{vm.label}</span>
                {showCounts &&
                  (loading ? (
                    <span className={styles.toolbarBadgeSkeleton} />
                  ) : (
                    <span className={styles.toolbarBadge}>{vm.count}</span>
                  ))}
              </div>
            ),
          }))}
          className={styles.viewModeToggle}
        />

        {hasGroupBy && (
          <>
            <div className={styles.toolbarSeparator} />

            <ToggleButton
              onOptionSelect={(idx) => onGroupByChange!((groupByOptions as CompareGroupByOption[])[idx].value)}
              defaultIndex={groupByIndex >= 0 ? groupByIndex : 0}
              options={(groupByOptions as CompareGroupByOption[]).map((g) => ({
                value: g.value,
                element: (
                  <Tooltip content={`Group by ${g.label}`}>
                    <span>{g.label}</span>
                  </Tooltip>
                ),
              }))}
              className={styles.groupByToggle}
            />
          </>
        )}

        {(viewMode === 'code' || viewMode === 'config' || viewMode === 'tests') && (
          <>
            <div className={styles.toolbarSeparator} />

            <ToggleButton
              onOptionSelect={(idx) => onDiffModeChange(idx === 0 ? 'split' : 'unified')}
              defaultIndex={diffMode === 'split' ? 0 : 1}
              options={[
                { value: 'split', element: <span>Split</span> },
                { value: 'unified', element: <span>Unified</span> },
              ]}
              className={styles.diffModeToggle}
            />
          </>
        )}
      </div>
    </div>
  );
}
