import { Icon } from '@teambit/evangelist.elements.icon';
import { TooltipDrawer } from '@teambit/evangelist.surfaces.tooltip';
import classNames from 'classnames';
import React, { ReactNode, useContext } from 'react';
import { CommandBarContext } from '@teambit/command-bar';
import { KeyCombo } from '@teambit/elements.keycap';
import styles from './main-dropdown.module.scss';

// type MainDropdownProps = {
// } & React.HTMLAttributes<HTMLDivElement>;

export function MainDropdown() {
  const commandBar = useContext(CommandBarContext);
  return (
    <div className={styles.mainDropdown}>
      <TooltipDrawer
        className={styles.dropdown}
        tooltipClass={styles.menu}
        placeholder=""
        clickOutside
        PlaceholderComponent={() => (
          <div>
            <div className={styles.overlay} />
            <Icon className={classNames(styles.icon)} of="more" />
          </div>
        )}
      >
        <div>
          <MenuBlock title="Shortcuts">
            <div>
              <Line
                title="Open/close sidebar"
                keyChar="mod + k"
                onClick={() => commandBar?.run('command-bar.open')}
              ></Line>
              <Line title="Open/close sidebar" keyChar="s" onClick={() => commandBar?.run('sidebar')}></Line>
              <Line title="Copy component id" keyChar="." onClick={() => commandBar?.run('copyBitId')}></Line>
              <Line title="copy component npm id" keyChar="," onClick={() => commandBar?.run('copyNpmId')}></Line>
            </div>
          </MenuBlock>
        </div>
      </TooltipDrawer>
    </div>
  );
}

type LineProps = {
  title: string;
  keyChar: string;
} & React.HTMLAttributes<HTMLDivElement>;

function Line({ title, keyChar, onClick }: LineProps) {
  return (
    <div className={classNames(styles.line)} onClick={onClick}>
      <div>{title}</div>
      <pre>
        <KeyCombo className={styles.keyBinding}>{keyChar}</KeyCombo>
      </pre>
    </div>
  );
}

function MenuBlock({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <div className={classNames(styles.menuBlock)}>
      <div className={styles.title}>{title}</div>
      {children}
    </div>
  );
}
