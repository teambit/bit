import React from 'react';
import classnames from 'classnames';
import { Icon, IconProps } from '@teambit/evangelist.elements.icon';
import { ComponentModel } from '@teambit/component';
import { colorPalette } from '@teambit/base-ui.theme.color-palette';
import { themedText } from '@teambit/base-ui.text.themed-text';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './deprecation-icon.module.scss';

export type DeprecationIconProps = { component: ComponentModel } & Omit<IconProps, 'of'>;

export function DeprecationIcon({ component, className, ...rest }: DeprecationIconProps) {
  const isDeprecated = component.deprecation?.isDeprecate;
  if (!isDeprecated) return null;

  return (
    <Tooltip
      className={styles.deprecatedTooltip}
      placement="bottom"
      content={<div className={styles.deprectaedTooltipContent}>Deprecated</div>}
    >
      <div>
        <Icon {...rest} of="note-deprecated" className={classnames(themedText, colorPalette.hunger, className)} />
      </div>
    </Tooltip>
  );
}
