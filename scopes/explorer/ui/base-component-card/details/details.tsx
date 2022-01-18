import React from 'react';
import classNames from 'classnames';
import { ellipsis as truncate } from '@teambit/toolbox.string.ellipsis';
import { Ellipsis } from '@teambit/design.ui.styles.ellipsis';

import styles from './details.module.scss';

export type ComponentDetailsProps = {
  id: string;
  version?: string;
  description?: string;
  /**
   * show verified badge if the component version is verified.
   */
  isVerified?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentDetails({ id, version, description, isVerified, className, ...rest }: ComponentDetailsProps) {
  const idArray = id.split('/'); // TODO - use component id once it is a separate component
  const nameSpace = idArray.length > 1 && idArray.slice(0, -1).join(' / ');
  const name = idArray.slice(-1);
  return (
    <div {...rest} className={classNames(styles.content, className)}>
      <div>
        <div className={styles.nameSpace}>{nameSpace}</div>
        <div className={styles.name}>
          <span>{name}</span>
          {/* do we still want the 'v' here if its a hash? looks weird */}
          <div className={styles.versionHolder}>
            {version && <Ellipsis>v{version}</Ellipsis>}
            {isVerified && (
              <img src="https://static.bit.dev/extensions-icons/verified-field-badge.svg" className={styles.img} />
            )}
          </div>
        </div>
        <div className={styles.description}>{truncate(description || '', 50)}</div>
      </div>
    </div>
  );
}
