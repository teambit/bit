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
      <DisplayJsonTree title={'Configuration'} object={config} />
      <DisplayJsonTree title={'Data'} object={data} />
    </div>
  );
}

/**
 * @todo extract to a separate component
 */

function DisplayJsonTree({ object, title }: { object: any; title: string }) {
  const [expandedDepth, setExpandedDepth] = useState<number>(1);
  const [isCopied, setIsCopied] = useState(false);
  const isDepthGreaterThanOne = Object.keys(object).some((key) => isObject(object[key]));
  const jsonContent = new JSONFormatter(object, expandedDepth, {
    theme: 'dark',
    hoverPreviewEnabled: true,
  });
  const collapsedExpandedIcon = expandedDepth === 1 ? expandIcon : collapsedIcon;

  const handleClick = (dataToCopy) => () => {
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
    copy(JSON.stringify(dataToCopy, null, 2));
  };

  const toggleExpandedDepth = (state: number) => {
    if (state === 1) return Infinity;
    return 1;
  };

  return (
    <>
      <div className={styles.sectionTitleContainer}>
        <div className={styles.sectionTitle}>{title}</div>
        <div className={styles.toolbar}>
          <CopiedMessage className={styles.copyMessage} show={isCopied} />
          <div className={styles.copy}>
            <button className={styles.copyButton} onClick={handleClick(jsonContent.json)}>
              <Icon className={styles.copyIcon} of="copy-cmp" />
            </button>
          </div>

          {isDepthGreaterThanOne && (
            <div className={styles.expandCollapse}>
              <img
                src={collapsedExpandedIcon}
                onClick={() => setExpandedDepth((value) => toggleExpandedDepth(value))}
              />
            </div>
          )}
        </div>
      </div>
      <div className={classNames(styles.log, styles.config)}>
        <div
          ref={(nodeElement) => {
            nodeElement && nodeElement.replaceChildren(jsonContent.render());
          }}
        />
      </div>
    </>
  );
}
