import classNames from 'classnames';
import React, { useMemo } from 'react';
import JSONFormatter from 'json-formatter-js';
import { Icon } from '@teambit/evangelist.elements.icon';
import { OrgAvatar } from '@teambit/staged-components.workspace-components.avatar';
import styles from './aspect-box.module.scss';

export type AspectBoxProps = {
  icon?: string;
  name?: string;
  link?: string;
  config: any;
  data: any;
} & React.HTMLAttributes<HTMLDivElement>;

export function AspectBox({ icon, name, link, config, data, className, ...rest }: AspectBoxProps) {
  const configContent = new JSONFormatter(config, 1, {
    theme: 'dark',
    hoverPreviewEnabled: true,
  });
  const dataContent = new JSONFormatter(data, 1, { theme: 'dark', hoverPreviewEnabled: true });
  return (
    <div {...rest} className={classNames(styles.aspectBox, className)}>
      <div className={styles.titleLine}>
        <div className={styles.titleLeft}>
          <OrgAvatar size={24} account={{ profileImage: icon }} className={styles.icon} />
          <div className={styles.name}>{name}</div>
        </div>
        <a className={styles.aspectLink} target="_blank" rel="noopener noreferrer" href={link}>
          <Icon of="open-tab" />
        </a>
      </div>
      <div className={styles.sectionTitle}>Configuration</div>
      <div className={classNames(styles.log, styles.config)}>
        <div
          ref={(nodeElement) => {
            nodeElement && nodeElement.appendChild(configContent.render());
          }}
        />
      </div>
      <div className={styles.sectionTitle}>Calculated data</div>
      <div className={styles.log}>
        <div
          ref={(nodeElement) => {
            nodeElement && nodeElement.appendChild(dataContent.render());
          }}
        />
      </div>
    </div>
  );
}
