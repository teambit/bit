import React from 'react';
import fileSize from 'pretty-bytes';
import { ComponentModel } from '@teambit/component';
import { PillLabel } from '@teambit/design.ui.pill-label';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './component-size.module.scss';

export type ComponentSizeProps = { legacyComponentModel?: ComponentModel } & React.HTMLAttributes<HTMLDivElement>;

export function ComponentSize({ legacyComponentModel, ...rest }: ComponentSizeProps) {
  // const builderData = componentDescriptor.get<BuilderData>('teambit.pipelines/builder');
  // const builder = builderData && BuilderData.fromJson(builderData);
  // const size: ComponentPreviewSize = builder?.getDataByAspect('teambit.preview/preview')?.size;
  const compressedSize = legacyComponentModel?.size?.compressedTotal;

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
        <PillLabel className={styles.label}>
          <img style={{ width: '16px', marginRight: '4px' }} src="https://static.bit.dev/bit-icons/weight.svg" />
          {fileSize(compressedSize)}
        </PillLabel>
      </div>
    </Tooltip>
  );
}
