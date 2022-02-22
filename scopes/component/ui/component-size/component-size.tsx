import React from 'react';
import fileSize from 'pretty-bytes';
import type { ComponentPreviewSize } from '@teambit/preview';
import { BuilderData } from '@teambit/builder-data';
import { PillLabel } from '@teambit/design.ui.pill-label';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './component-size.module.scss';

export type ComponentSizeProps = { componentDescriptor: ComponentDescriptor } & React.HTMLAttributes<HTMLDivElement>;

export function ComponentSize({ componentDescriptor, ...rest }: ComponentSizeProps) {
  const builderData = componentDescriptor.get<BuilderData>('teambit.pipelines/builder');
  const builder = builderData && BuilderData.fromJson(builderData);
  const size: ComponentPreviewSize = builder?.getDataByAspect('teambit.preview/preview')?.size;
  const compressedSize = size?.compressedTotal;

  if (!compressedSize) return null;
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
          {fileSize(compressedSize)}
        </PillLabel>
      </div>
    </Tooltip>
  );
}
