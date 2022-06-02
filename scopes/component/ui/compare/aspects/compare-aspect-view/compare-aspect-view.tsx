import React, { HTMLAttributes, useMemo } from 'react';
import classNames from 'classnames';
import { H4 } from '@teambit/documenter.ui.heading';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { ComponentAspectData } from '@teambit/component.ui.compare';
import { DiffEditor } from '@monaco-editor/react';
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
  className,
}: CompareAspectViewProps) {
  const title = useMemo(() => name?.split('/').pop(), [name]);

  const configDiffEditor = (
    <DiffEditor
      key={`aspect-config-diff-editor-${title}`}
      modified={JSON.stringify(compareAspectData?.config, null, 2)}
      original={JSON.stringify(baseAspectData?.config, null, 2)}
      language={'json'}
      className={styles.diffEditor}
      theme={'vs-dark'}
      options={{
        readOnly: true,
      }}
      loading={
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      }
    />
  );

  const calculatedDataDiffEditor = (
    <DiffEditor
      key={`aspect-data-diff-editor-${title}`}
      modified={JSON.stringify(compareAspectData?.data, null, 2)}
      original={JSON.stringify(baseAspectData?.data, null, 2)}
      language={'json'}
      className={styles.diffEditor}
      theme={'vs-dark'}
      options={{
        readOnly: true,
      }}
      loading={
        <div className={styles.loader}>
          <RoundLoader />
        </div>
      }
    />
  );

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
          {configDiffEditor}
        </div>
        <div className={styles.componentCompareAspectCalculatedDiff}>
          <H4 size="xxs" className={styles.name}>
            <span>Calculated Data</span>
          </H4>
          {calculatedDataDiffEditor}
        </div>
      </div>
    </div>
  );
}
