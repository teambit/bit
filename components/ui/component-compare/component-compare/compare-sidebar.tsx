/* eslint-disable @typescript-eslint/no-use-before-define */ // hoisted helper/components used before their definition
import React, { useState, useEffect } from 'react';
import { Icon } from '@teambit/design.elements.icon';
import type { FileInfo } from './file-registry';
import { usePersistedToggle } from './use-persisted-toggle';
import styles from './compare-sidebar.module.scss';

export type CompareSidebarItem = {
  id: string;
  name: string;
  envIcon?: string;
  status?: 'NEW' | 'SOURCE_CODE' | 'DEPENDENCY' | 'ASPECTS' | 'NONE' | string;
  files?: FileInfo[];
  /** optional indicator (e.g. where the base came from) rendered next to the component name */
  sourceIndicator?: React.ReactNode;
};

export type CompareSidebarGroup = {
  key: string;
  label: string;
  icon?: string;
  items: CompareSidebarItem[];
};

export type CompareSidebarProps = {
  groups: CompareSidebarGroup[];
  selectedId?: string;
  selectedFile?: string;
  onSelect: (id: string, fileName?: string) => void;
  loading?: boolean;
  className?: string;
  defaultExpandFiles?: boolean;
  /**
   * collapse the sidebar to a rail. Leave undefined to let the sidebar own the state and remember
   * the reader's choice across visits; pass it to drive the collapse from outside.
   */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** scopes the remembered collapse state, so distinct surfaces can keep separate preferences */
  collapseStorageKey?: string;
};

const DEFAULT_COLLAPSE_STORAGE_KEY = 'bit.compare.sidebar.collapsed';

export function CompareSidebar({
  groups,
  selectedId,
  selectedFile,
  onSelect,
  loading,
  className,
  defaultExpandFiles,
  collapsed,
  onCollapsedChange,
  collapseStorageKey = DEFAULT_COLLAPSE_STORAGE_KEY,
}: CompareSidebarProps) {
  const [remembered, remember, hydrated] = usePersistedToggle(collapseStorageKey, false);
  // uncontrolled by default so every surface that renders the sidebar gets the memory for free
  const isControlled = collapsed !== undefined;
  const isCollapsed = isControlled ? collapsed : remembered;

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    if (!isControlled) remember(next);
    onCollapsedChange?.(next);
  };

  const totalItems = groups.reduce((count, group) => count + group.items.length, 0);

  return (
    <div
      className={compose(
        styles.sidebar,
        isCollapsed && styles.sidebarCollapsed,
        // only animate once the remembered value has been applied, so a sidebar that was left
        // collapsed does not visibly slide shut on every page load
        hydrated && styles.animated,
        className
      )}
      data-collapsed={isCollapsed || undefined}
    >
      <div className={styles.sidebarHeader}>
        <button
          className={styles.collapseToggle}
          onClick={toggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? 'Expand components sidebar' : 'Collapse components sidebar'}
          title={isCollapsed ? 'Expand components' : 'Collapse components'}
        >
          <Icon
            of="fat-arrow-down"
            className={compose(styles.chevron, isCollapsed ? styles.chevronRight : styles.chevronLeft)}
          />
        </button>
        <span className={styles.sidebarTitle}>Components</span>
        {selectedId && (
          <button className={styles.clearSelectionLink} onClick={() => onSelect('')}>
            Clear
          </button>
        )}
      </div>
      {isCollapsed && (
        <button
          className={styles.collapsedRail}
          onClick={toggleCollapsed}
          tabIndex={-1}
          aria-hidden
          title={`Components${totalItems ? ` (${totalItems})` : ''}`}
        >
          <span className={styles.collapsedRailLabel}>Components{totalItems ? ` \u00b7 ${totalItems}` : ''}</span>
        </button>
      )}
      {/* kept mounted while collapsed so per-component file trees keep their expanded state */}
      <div className={styles.sidebarContent}>
        {loading && (
          <div className={styles.sidebarLoading}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.sidebarSkeleton}>
                <div className={styles.skeleton} style={{ width: `${60 + (i % 3) * 20}%`, height: '12px' }} />
              </div>
            ))}
          </div>
        )}
        {!loading &&
          groups.map((group) => (
            <SidebarGroup
              key={group.key}
              group={group}
              selectedId={selectedId}
              selectedFile={selectedFile}
              onSelect={onSelect}
              isSingleGroup={groups.length === 1}
              defaultExpandFiles={defaultExpandFiles}
            />
          ))}
      </div>
    </div>
  );
}

type SidebarGroupProps = {
  group: CompareSidebarGroup;
  selectedId?: string;
  selectedFile?: string;
  onSelect: (id: string, fileName?: string) => void;
  isSingleGroup: boolean;
  defaultExpandFiles?: boolean;
};

function SidebarGroup({
  group,
  selectedId,
  selectedFile,
  onSelect,
  isSingleGroup,
  defaultExpandFiles,
}: SidebarGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.sidebarGroup}>
      {!isSingleGroup && (
        <button className={styles.sidebarGroupHeader} onClick={() => setCollapsed(!collapsed)}>
          <Icon of="fat-arrow-down" className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`} />
          {group.icon && <Icon of={group.icon} />}
          <span className={styles.groupLabel}>{group.label}</span>
          <span className={styles.groupCount}>{group.items.length}</span>
        </button>
      )}
      {!collapsed && (
        <div className={styles.sidebarItems}>
          {group.items.map((item) => (
            <SidebarComponentItem
              key={item.id}
              item={item}
              isSelected={selectedId === item.id}
              selectedFile={selectedId === item.id ? selectedFile : undefined}
              onSelect={onSelect}
              defaultExpand={defaultExpandFiles}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type SidebarComponentItemProps = {
  item: CompareSidebarItem;
  isSelected: boolean;
  selectedFile?: string;
  onSelect: (id: string, fileName?: string) => void;
  defaultExpand?: boolean;
};

function SidebarComponentItem({ item, isSelected, selectedFile, onSelect, defaultExpand }: SidebarComponentItemProps) {
  const [expanded, setExpanded] = useState(defaultExpand ?? false);
  const hasFiles = item.files && item.files.length > 0;

  useEffect(() => {
    if (defaultExpand && hasFiles) setExpanded(true);
  }, [defaultExpand, hasFiles]);

  return (
    <div className={styles.componentItemWrapper}>
      <button
        className={`${styles.sidebarItem} ${isSelected && !selectedFile ? styles.sidebarItemSelected : ''}`}
        onClick={() => onSelect(item.id)}
      >
        {hasFiles ? (
          <span
            className={`${styles.fileChevron} ${expanded ? '' : styles.chevronCollapsed}`}
            role="button"
            tabIndex={0}
            aria-label={expanded ? 'Collapse files' : 'Expand files'}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(!expanded);
              }
            }}
          >
            <Icon of="fat-arrow-down" className={styles.chevronIcon} />
          </span>
        ) : (
          <span className={styles.fileChevronPlaceholder} />
        )}
        {item.envIcon ? (
          <img src={item.envIcon} className={styles.envIcon} alt="" />
        ) : (
          <span className={styles.envIconPlaceholder} />
        )}
        <span className={styles.componentName}>{item.name}</span>
        {item.sourceIndicator && <span className={styles.sourceIndicator}>{item.sourceIndicator}</span>}
        {item.status && (
          <span className={`${styles.componentStatus} ${styles[`componentStatus${item.status}`] || ''}`}>
            {formatStatus(item.status)}
          </span>
        )}
        {hasFiles && <span className={styles.fileCount}>{item.files!.length}</span>}
      </button>
      {expanded && hasFiles && (
        <div className={styles.fileTree}>
          {item.files!.map((file) => (
            <button
              key={file.name}
              className={`${styles.fileItem} ${selectedFile === file.name && isSelected ? styles.fileItemSelected : ''}`}
              onClick={() => onSelect(item.id, file.name)}
            >
              <span className={`${styles.fileStatus} ${file.status ? styles[`fileStatus${file.status}`] : ''}`} />
              <span className={styles.fileName}>{file.name}</span>
              {file.status && file.status !== 'UNCHANGED' && (
                <span className={`${styles.fileStatusLabel} ${styles[`fileStatusLabel${file.status}`] || ''}`}>
                  {file.status === 'NEW' ? 'N' : file.status === 'DELETED' ? 'D' : 'M'}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function compose(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  SOURCE_CODE: 'Modified',
  DEPENDENCY: 'Modified',
  ASPECTS: 'Modified',
  MODIFIED: 'Modified',
  DELETED: 'Deleted',
};

function formatStatus(status: string): string {
  return STATUS_LABELS[status] || status;
}
