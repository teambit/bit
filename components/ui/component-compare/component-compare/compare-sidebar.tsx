/* eslint-disable @typescript-eslint/no-use-before-define */ // hoisted helper/components used before their definition
import React, { useState, useEffect } from 'react';
import { Icon } from '@teambit/design.elements.icon';
import type { FileInfo } from './file-registry';
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
};

export function CompareSidebar({
  groups,
  selectedId,
  selectedFile,
  onSelect,
  loading,
  className,
  defaultExpandFiles,
}: CompareSidebarProps) {
  return (
    <div className={`${styles.sidebar}${className ? ` ${className}` : ''}`}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Components</span>
        {selectedId && (
          <button className={styles.clearSelectionLink} onClick={() => onSelect('')}>
            Clear
          </button>
        )}
      </div>
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
