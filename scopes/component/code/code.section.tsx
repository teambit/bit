import { Section } from '@teambit/component';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './code.module.scss';
import type { CodeUI } from './code.ui.runtime';

export class CodeSection implements Section {
  constructor(private codeUI: CodeUI) {}
  route = {
    path: '~code/:file*',
    children: this.codeUI.getCodePage(),
  };
  navigationLink = {
    href: '~code',
    children: <Icon of="Code" className={styles.icon} />,
  };
  order = 30;
}
