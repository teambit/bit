import React from 'react';
import classNames from 'classnames';
import type { DeprecationInfo } from '@teambit/deprecation';
import { ComponentID } from '@teambit/component-id';
import { useComponentUrl } from '@teambit/component.modules.component-url';
import { PillLabel } from '@teambit/design.ui.pill-label';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { Link } from '@teambit/base-react.navigation.link';
import styles from './component-deprecated.module.scss';

export type ComponentDeprecatedProps = {
  deprecation?: DeprecationInfo;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentDeprecated({ deprecation, className, ...rest }: ComponentDeprecatedProps) {
  const isDeprecated = deprecation?.isDeprecate;
  if (!isDeprecated) return null;

  const newId = deprecation?.newId;
  if (!newId)
    return (
      <Tooltip
        className={styles.componentTooltip}
        placement="bottom"
        content={
          <div className={styles.componentTooltipContent}>
            This component was deprecated without providing a replacement.
          </div>
        }
      >
        <div {...rest}>
          <PillLabel className={classNames(styles.label, className)}>
            <div>
              <img className={styles.deprecatedImage} src="https://static.bit.dev/bit-icons/deprecated-black.svg" />
              <span>Deprecated</span>
            </div>
          </PillLabel>
        </div>
      </Tooltip>
    );

  const newComponentUrl = useComponentUrl(ComponentID.fromString(newId)) || newId;
  const isLink = newComponentUrl.startsWith('http');
  return (
    <Tooltip
      className={styles.componentTooltip}
      placement="bottom"
      content={
        <div className={styles.componentTooltipContent}>
          <div>Replaced by</div>
          {isLink && (
            <Link external href={newComponentUrl} className={styles.link}>
              {newComponentUrl}
            </Link>
          )}
          {!isLink && newComponentUrl}
        </div>
      }
    >
      <div {...rest}>
        <PillLabel className={classNames(styles.label, className)}>
          <div className={styles.separator}>
            <img className={styles.deprecatedImage} src="https://static.bit.dev/bit-icons/deprecated-black.svg" />
            <span>Deprecated</span>
          </div>
          <div>
            <img className={styles.arrowImage} src="https://static.bit.dev/bit-icons/arrow-up-right-black.svg" />
          </div>
        </PillLabel>
      </div>
    </Tooltip>
  );
}
