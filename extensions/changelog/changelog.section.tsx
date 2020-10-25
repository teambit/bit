import { Section } from '@teambit/component';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './changelog.module.scss';
import { ChangeLogPage } from './ui/change-log-page';

export class ChangelogSection implements Section {
  route = {
    path: '~changelog',
    children: <ChangeLogPage className={styles.changeLog} />,
  };
  navigationLink = {
    href: '~changelog',
    children: <Icon of="changelog" />,
  };
  order = 30;
}
