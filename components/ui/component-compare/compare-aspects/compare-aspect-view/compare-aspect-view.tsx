import React, { HTMLAttributes, useMemo } from 'react';
import classNames from 'classnames';
import { H4 } from '@teambit/documenter.ui.heading';
import { BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { DiffEditor } from '@monaco-editor/react';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import { ComponentAspectData } from '@teambit/component.ui.component-compare.compare-aspects.models.component-compare-aspects-model';

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

  const configDiffEditor = (
    <DiffEditor
      key={`aspect-config-diff-editor-${title}`}
      modified={JSON.stringify(compareAspectData?.config, null, 2)}
      original={JSON.stringify(baseAspectData?.config, null, 2)}
      language={'json'}
      className={darkMode}
      theme={'vs-dark'}
      options={{
        readOnly: true,
      }}
      loading={<AspectsCompareViewLoader />}
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
      loading={<AspectsCompareViewLoader />}
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
          {loading ? <AspectsCompareViewLoader /> : configDiffEditor}
        </div>
        <div className={styles.componentCompareAspectCalculatedDiff}>
          <H4 size="xxs" className={styles.name}>
            <span>Calculated Data</span>
          </H4>
          {loading ? <AspectsCompareViewLoader /> : calculatedDataDiffEditor}
        </div>
      </div>
    </div>
  );
}

function AspectsCompareViewLoader() {
  return <BlockSkeleton className={styles.loader} lines={16} />;
}
