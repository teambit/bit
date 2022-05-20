import React, { HTMLAttributes, useMemo } from 'react';
import classNames from 'classnames';
import { H4 } from '@teambit/documenter.ui.heading';
import { ComponentAspectData } from '@teambit/component.ui.component-compare-aspects';
import { DiffEditor, DiffEditorProps } from '@monaco-editor/react';
import styles from './component-compare-aspect-view.module.scss';

export type ComponentCompareAspectViewProps = {
  baseAspectData?: ComponentAspectData;
  compareAspectData?: ComponentAspectData;
  loading?: boolean;
  name?: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareAspectView({
  baseAspectData,
  compareAspectData,
  loading,
  name,
  className,
}: ComponentCompareAspectViewProps) {
  const title = useMemo(() => name?.split('/').pop(), [name]);

  if (loading) return null;

  const configDiffEditorProps: DiffEditorProps = {
    modified: JSON.stringify(baseAspectData?.config, null, 2),
    original: JSON.stringify(compareAspectData?.config, null, 2),
    language: 'json',
    className: styles.diffEditor,
    theme: 'vs-dark',
  };

  const calculatedDataDiffEditorProps: DiffEditorProps = {
    modified: JSON.stringify(baseAspectData?.data, null, 2),
    original: JSON.stringify(compareAspectData?.data, null, 2),
    language: 'json',
    className: styles.diffEditor,
    theme: 'vs-dark',
  };

  return (
    <div
      key={`component-compare-aspect-view-${name}`}
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
          <DiffEditor {...configDiffEditorProps} />
        </div>
        <div className={styles.componentCompareAspectCalculatedDiff}>
          <H4 size="xxs" className={styles.name}>
            <span>Calculated Data</span>
          </H4>
          <DiffEditor {...calculatedDataDiffEditorProps} />
        </div>
      </div>
    </div>
  );
}
