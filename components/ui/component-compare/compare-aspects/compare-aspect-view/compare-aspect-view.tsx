import type { HTMLAttributes } from 'react';
import React, { useMemo } from 'react';
import classNames from 'classnames';
import { H4 } from '@teambit/documenter.ui.heading';
import { BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { DiffViewer } from '@teambit/code.ui.diff-viewer';
import type { ComponentAspectData } from '@teambit/component.ui.component-compare.compare-aspects.models.component-compare-aspects-model';
import { ConfigDiffEditor } from './config-editor';
import styles from './compare-aspect-view.module.scss';

export type CompareAspectViewProps = {
  baseAspectData?: ComponentAspectData;
  compareAspectData?: ComponentAspectData;
  loading?: boolean;
  name?: string;
} & HTMLAttributes<HTMLDivElement>;

export function CompareAspectView({
  baseAspectData,
  compareAspectData,
  name,
  loading,
  className,
}: CompareAspectViewProps) {
  const title = useMemo(() => name?.split('/').pop(), [name]);
  const originalConfig = JSON.stringify(baseAspectData?.config, null, 2) || '';
  const modifiedConfig = JSON.stringify(compareAspectData?.config, null, 2) || '';
  const originalData = JSON.stringify(baseAspectData?.data, null, 2) || '';
  const modifiedData = JSON.stringify(compareAspectData?.data, null, 2) || '';

  return (
    <div
      key={`aspect-diff-editor-${title}`}
      className={classNames(styles.componentCompareAspectViewContainer, className)}
    >
      <div className={styles.name}>
        <H4 size="xs" className={styles.name}>
          <span>{title}</span>
        </H4>
      </div>
      <div className={styles.componentCompareAspectDiffEditorContainer}>
        <div className={styles.componentCompareAspectConfigDiff}>
          <H4 size="xxs" className={styles.name}>
            <span>Config</span>
          </H4>
          {loading ? (
            <AspectsCompareViewLoader />
          ) : (
            <ConfigDiffEditor
              original={originalConfig}
              modified={modifiedConfig}
              name={`${title || 'aspect'} config`}
            />
          )}
        </div>
        <div className={styles.componentCompareAspectCalculatedDiff}>
          <H4 size="xxs" className={styles.name}>
            <span>Calculated Data</span>
          </H4>
          {loading ? (
            <AspectsCompareViewLoader />
          ) : (
            <DiffViewer
              className={styles.diffEditor}
              fileName={`${title || 'aspect'}-data.json`}
              oldContent={originalData}
              newContent={modifiedData}
              language="json"
              defaultView="split"
              showHeader={false}
              collapsible={false}
              maxHeight={420}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AspectsCompareViewLoader() {
  return <BlockSkeleton className={styles.loader} lines={16} />;
}
