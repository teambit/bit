import classNames from 'classnames';
import React, { useState } from 'react';
import JSONFormatter from 'json-formatter-js';
import styles from './aspect-box.module.scss';
import { isObject } from 'lodash';

export type AspectBoxProps = {
  icon?: string;
  name?: string;
  link?: string;
  config: any;
  data: any;
} & React.HTMLAttributes<HTMLDivElement>;

const collapsedIcon = 'https://static.bit.dev/bit-icons/collapse.svg';
const expandIcon = 'https://static.bit.dev/bit-icons/expand.svg';
export function AspectBox({ icon, name, config, data, className, ...rest }: AspectBoxProps) {
  const [configCollapseState, setConfigCollapseState] = useState<number>(1);
  const [dataCollapseState, setDataCollapseState] = useState<number>(1);
  const configCollapseExpandIcon = configCollapseState === 1 ? expandIcon : collapsedIcon;
  const dataCollapseExpandIcon = dataCollapseState === 1 ? expandIcon : collapsedIcon;
  const isDataDepthGreaterThanOne = Object.keys(data).some((key) => isObject(data[key]));
  const isConfigDepthGreaterThanOne = Object.keys(config).some((key) => isObject(data[key]));

  const toggleCollapseState = (state: number) => {
    if (state === 1) return Infinity;
    return 1;
  };

  const configContent = new JSONFormatter(config, configCollapseState, {
    theme: 'dark',
    hoverPreviewEnabled: true,
  });

  const dataContent = new JSONFormatter(data, dataCollapseState, { theme: 'dark' });

  return (
    <div {...rest} className={classNames(styles.aspectBox, className)}>
      <div className={styles.titleLine}>
        <div className={styles.titleLeft}>
          <div className={styles.iconWrapper}>
            <img className={styles.icon} src={icon} />
          </div>
          <div className={styles.name}>{name}</div>
        </div>
        {/* <a className={styles.aspectLink} target="_blank" rel="noopener noreferrer" href={link}>
          <Icon of="open-tab" />
        </a> */}
      </div>
      <div className={styles.sectionTitleContainer}>
        <div className={styles.sectionTitle}>Configuration</div>
        {isConfigDepthGreaterThanOne && (
          <div className={styles.expandCollapse}>
            <img
              src={configCollapseExpandIcon}
              onClick={() => setConfigCollapseState((value) => toggleCollapseState(value))}
            />
          </div>
        )}
      </div>
      <div className={classNames(styles.log, styles.config)}>
        <div
          ref={(nodeElement) => {
            nodeElement && nodeElement.replaceChildren(configContent.render());
          }}
        />
      </div>
      <div className={styles.sectionTitleContainer}>
        <div className={styles.sectionTitle}>Calculated Data</div>
        {isDataDepthGreaterThanOne && (
          <div className={styles.expandCollapse}>
            <img
              src={dataCollapseExpandIcon}
              onClick={() => setDataCollapseState((value) => toggleCollapseState(value))}
            />
          </div>
        )}
      </div>
      <div className={styles.log}>
        <div
          ref={(nodeElement) => {
            nodeElement && nodeElement.replaceChildren(dataContent.render());
          }}
        />
      </div>
    </div>
  );
}
