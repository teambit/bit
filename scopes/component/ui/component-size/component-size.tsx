import React from 'react';
import fileSize from 'pretty-bytes';
import { PillLabel } from '@teambit/design.ui.pill-label';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './component-size.module.scss';

export type ComponentSizeProps = { componentDescriptor: ComponentDescriptor } & React.HTMLAttributes<HTMLDivElement>;

export function ComponentSize({ componentDescriptor, ...rest }: ComponentSizeProps) {
  const builderData = componentDescriptor.get('teambit.pipelines/builder');
  // const builder = BuilderData.fromJson(a);
  // TODO - find a better way to extract data and which type to use
  const size = builderData?.aspectsData?.find((x) => x.aspectId === 'teambit.preview/preview')?.data?.size?.total;
  // console.log('com', componentDescriptor, a, a?.aspectsData, size);
  console.log('builder', builderData);
  if (!size) return null;
  return (
    <Tooltip
      className={styles.componentSizeTooltip}
      placement="bottom"
      content={
        <div className={styles.componentSizeTooltipContent}>
          Component bundle with dependencies, minified and gzipped
        </div>
      }
    >
      <div {...rest}>
        <PillLabel>
          <img style={{ width: '16px', marginRight: '4px' }} src="https://static.bit.dev/bit-icons/weight.svg" />
          {fileSize(size)}
        </PillLabel>
      </div>
    </Tooltip>
  );
}
