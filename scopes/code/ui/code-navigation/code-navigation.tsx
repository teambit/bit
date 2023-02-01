import React, { ComponentType, HTMLAttributes } from 'react';
import { FileIconMatch, getFileIcon } from '@teambit/code.ui.utils.get-file-icon';
import { NavPlugin, CollapsibleMenuNav } from '@teambit/component';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import classNames from 'classnames';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';

import styles from './code-navigation.module.scss';

export type CodeNavigationProps = {
  Menu?: React.ReactNode;
  files: string[];
  selectedFile: string;
  fileIconMatchers: FileIconMatch[];
  getHref: (node: { id: string }) => string;
  onTabClicked?: (id: string, event?: React.MouseEvent) => void;
  widgets?: ComponentType<WidgetProps<any>>[];
};

export function CodeNavigation({
  files,
  selectedFile,
  fileIconMatchers,
  onTabClicked,
  getHref,
  widgets,
  Menu,
}: CodeNavigationProps) {
  return (
    <CodeNav
      files={files}
      selectedFile={selectedFile}
      fileIconMatchers={fileIconMatchers}
      onTabClicked={onTabClicked}
      getHref={getHref}
      widgets={widgets}
    >
      {Menu && (
        <Dropdown
          className={styles.codeCompareWidgets}
          dropClass={styles.codeCompareMenu}
          placeholder={
            <div className={styles.codeCompareWidgets}>
              <div className={styles.settings}>
                <img src={'https://static.bit.dev/bit-icons/setting.svg'}></img>
              </div>
            </div>
          }
          clickPlaceholderToggles={true}
          position={'left-start'}
          clickToggles={false}
        >
          {Menu}
        </Dropdown>
      )}
    </CodeNav>
  );
}

function CodeNav({
  files,
  selectedFile,
  fileIconMatchers,
  onTabClicked,
  getHref,
  children,
  widgets,
}: Omit<CodeNavigationProps, 'Menu'> & HTMLAttributes<HTMLDivElement>) {
  const extractedTabs: [string, NavPlugin][] = files.map((file, index) => {
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
              <img src={getFileIcon(fileIconMatchers, file)}></img>
              <span>{file}</span>
              <div className={styles.codeCompareTabRight}>
                {widgets?.map((Widget, widgetIndex) => (
                  <Widget key={widgetIndex} node={{ id: file }} />
                ))}
              </div>
            </div>
          ),
          ignoreQueryParams: true,
        },
      },
    ];
  });

  return (
    <div className={styles.navContainer}>
      <CollapsibleMenuNav
        className={styles.compareNav}
        secondaryNavClassName={styles.compareSecondaryNav}
        navPlugins={extractedTabs}
      >
        {children}
      </CollapsibleMenuNav>
    </div>
  );
}
