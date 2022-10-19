import classNames from 'classnames';
import React, { useState } from 'react';
import JSONFormatter from 'json-formatter-js';
import { isObject } from 'lodash';
import { CopiedMessage } from '@teambit/documenter.ui.copied-message';
import { Icon } from '@teambit/evangelist.elements.icon';
import copy from 'copy-to-clipboard';

import styles from './aspect-box.module.scss';

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
  const [isCopiedData, setIsCopiedData] = useState(false);
  const [isCopiedConfig, setIsCopiedConfig] = useState(false);

  const handleClick = (dataToCopy, dataOrConfig: 'data' | 'config') => () => {
    if (dataOrConfig === 'data') setIsCopiedData(true);
    else setIsCopiedConfig(true);
    setTimeout(() => {
      if (dataOrConfig === 'data') setIsCopiedData(false);
      else setIsCopiedConfig(false);
    }, 2000);
    copy(JSON.stringify(dataToCopy, null, 2));
  };

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
        <div className={styles.toolbar}>
          <CopiedMessage className={styles.copyMessage} show={isCopiedConfig} />
          <div className={styles.copy}>
            <button className={styles.copyButton} onClick={handleClick(configContent.json, 'config')}>
              <Icon className={styles.copyIcon} of="copy-cmp" />
            </button>
          </div>

          {isConfigDepthGreaterThanOne && (
            <div className={styles.expandCollapse}>
              <img
                src={configCollapseExpandIcon}
                onClick={() => setConfigCollapseState((value) => toggleCollapseState(value))}
              />
            </div>
          )}
        </div>
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
        <div className={styles.toolbar}>
          <CopiedMessage className={styles.copyMessage} show={isCopiedData} />
          <div className={styles.copy}>
            <button className={styles.copyButton} onClick={handleClick(dataContent.json, 'data')}>
              <Icon className={styles.copyIcon} of="copy-cmp" />
            </button>
          </div>
          {isDataDepthGreaterThanOne && (
            <div className={styles.expandCollapse}>
              <img
                src={dataCollapseExpandIcon}
                onClick={() => setDataCollapseState((value) => toggleCollapseState(value))}
              />
            </div>
          )}
        </div>
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
