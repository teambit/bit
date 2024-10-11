/* eslint-disable react/require-default-props */
import React, { ComponentType, HTMLAttributes, useState } from 'react';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { NavPlugin, CollapsibleMenuNav } from '@teambit/component';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import classNames from 'classnames';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';

import styles from './code-compare-navigation.module.scss';

export type CodeCompareNavigationProps = {
  Menu: React.ReactNode;
  files: string[];
  selectedFile: string;
  fileIconMatchers: FileIconMatch[];
  getHref: (node: { id: string }) => string;
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  widgets?: ComponentType<WidgetProps<any>>[];
};

type CodeCompareNavProps = {
  files: string[];
  selectedFile: string;
  fileIconMatchers: FileIconMatch[];
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  getHref: (node: { id: string }) => string;
  widgets?: ComponentType<WidgetProps<any>>[];
} & HTMLAttributes<HTMLDivElement>;

function CodeCompareNav({
  files,
  selectedFile,
  fileIconMatchers,
  onTabClicked = () => {},
  getHref,
  children,
  widgets = [],
}: CodeCompareNavProps) {
  const selectedFileIndex = files.findIndex((file) => file === selectedFile);

  const extractedTabs: [string, NavPlugin][] = React.useMemo(
    () =>
      files.map((file, index) => {
        const isActive = file === selectedFile;
        const href = getHref({ id: file });

        return [
          file,
          {
            props: {
              href,
              active: isActive,
              onClick: onTabClicked && ((e) => onTabClicked(file, e)),
              activeClassName: styles.activeNav,
              className: classNames(styles.compareNavItem, index === 0 && styles.first),
              children: (
                <div className={styles.codeCompareTab}>
                  <img src={getFileIcon(fileIconMatchers, file)} alt="file-icon" />
                  <span>{file}</span>
                  <div className={styles.codeCompareTabRight}>
                    {widgets?.map((Widget, widgetIndex) => <Widget key={widgetIndex} node={{ id: file }} />)}
                  </div>
                </div>
              ),
              ignoreQueryParams: true,
            },
          },
        ];
      }),
    [files.join(''), selectedFile]
  );

  return (
    <div className={styles.navContainer}>
      <CollapsibleMenuNav
        className={styles.compareNav}
        secondaryNavClassName={styles.compareSecondaryNav}
        navPlugins={extractedTabs}
        activeTabIndex={selectedFileIndex}
        alwaysShowActiveTab
      >
        {children}
      </CollapsibleMenuNav>
    </div>
  );
}

export function CodeCompareNavigation({
  files,
  selectedFile,
  fileIconMatchers,
  onTabClicked,
  getHref,
  widgets,
  Menu,
}: CodeCompareNavigationProps) {
  const [open, setOpen] = useState<boolean | undefined>();

  return (
    <CodeCompareNav
      files={files}
      selectedFile={selectedFile}
      fileIconMatchers={fileIconMatchers}
      onTabClicked={onTabClicked}
      getHref={getHref}
      widgets={widgets}
    >
      <Dropdown
        className={styles.codeCompareWidgets}
        dropClass={styles.codeCompareMenu}
        open={open}
        placeholder={
          <div className={styles.codeCompareWidgets}>
            <div className={styles.settings}>
              <img src="https://static.bit.dev/bit-icons/setting.svg" alt="settings-icon" />
            </div>
          </div>
        }
        clickPlaceholderToggles
        clickOutside
        position="left-start"
        clickToggles={false}
        onPlaceholderToggle={() => setOpen((o) => !o)}
        onClickOutside={() => {
          setOpen(false);
        }}
      >
        {Menu}
      </Dropdown>
    </CodeCompareNav>
  );
}
