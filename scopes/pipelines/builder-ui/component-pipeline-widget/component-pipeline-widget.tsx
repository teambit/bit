import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './component-pipeline-widget.module.scss';

export type ComponentPipelineWidgetProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentPipelineWidget({ className, ...rest }: ComponentPipelineWidgetProps) {
  return (
    <Tooltip placement="bottom" offset={[0, 15]} content={'Pipeline'}>
      <div {...rest} className={classNames(styles.widgetMenuIcon, className)}>
        <img src={'https://static.bit.dev/bit-icons/pipe.svg'} />
      </div>
    </Tooltip>
  );
}
