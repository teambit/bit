import { Section } from '@teambit/component';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './code.module.scss';
import { CodePage } from './ui/code-tab-page';

export class CodeSection implements Section {
  route = {
    path: '~code',
    children: <CodePage className={styles.code} />,
  };
  navigationLink = {
    href: '~code',
    children: <Icon of="Code" className={styles.icon} />,
  };
  order = 30;
}
