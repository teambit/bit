import type { HTMLAttributes } from 'react';
import React from 'react';
import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
import { Radio } from '@teambit/design.ui.input.radio';
import classnames from 'classnames';

import styles from './code-compare-editor-settings.module.scss';

export type EditorViewMode = 'inline' | 'split';
export type EditorSettingsHooks = {
  onViewModeChanged: (editorViewMode: EditorViewMode) => void;
  onWordWrapChanged: (wordWrap: boolean) => void;
  onIgnoreWhitespaceChanged: (ignoreWhitespace: boolean) => void;
  onDiffOnlyChanged?: (diffOnly: boolean) => void;
};
export type EditorSettingsState = {
  editorViewMode: EditorViewMode;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
  diffOnly?: boolean;
};
export type EditorSettings = EditorSettingsHooks & EditorSettingsState;

export type CodeCompareEditorSettingsProps = {} & HTMLAttributes<HTMLDivElement> & EditorSettings;

export function CodeCompareEditorSettings({
  wordWrap,
  ignoreWhitespace,
  editorViewMode,
  diffOnly,
  onDiffOnlyChanged,
  onWordWrapChanged,
  onIgnoreWhitespaceChanged,
  onViewModeChanged,
  className,
  ...rest
}: CodeCompareEditorSettingsProps) {
  return (
    <div {...rest} className={classnames(styles.settingsMenu, className)}>
      <div className={styles.settingsTitle}>Diff View</div>
      <div className={styles.splitSettings}>
        <Radio
          className={styles.splitOption}
          checked={editorViewMode === 'inline'}
          value="inline"
          onInputChanged={() => onViewModeChanged('inline')}
        >
          <span>Inline</span>
        </Radio>
        <Radio
          className={styles.splitOption}
          checked={editorViewMode === 'split'}
          value="split"
          onInputChanged={() => onViewModeChanged('split')}
        >
          <span>Split</span>
        </Radio>
      </div>
      {onDiffOnlyChanged && (
        <div className={styles.diffOnlySettings}>
          <CheckboxItem
            className={styles.checkbox}
            checked={diffOnly}
            onInputChanged={() => onDiffOnlyChanged?.(!diffOnly)}
          >
            Show only diff
          </CheckboxItem>
        </div>
      )}
      <div className={styles.ignoreWhitespaceSettings}>
        <CheckboxItem
          className={styles.checkbox}
          checked={ignoreWhitespace}
          onInputChanged={() => onIgnoreWhitespaceChanged(!ignoreWhitespace)}
        >
          Hide whitespace
        </CheckboxItem>
      </div>
      <div className={styles.wordWrapSettings}>
        <CheckboxItem
          className={styles.checkbox}
          checked={wordWrap}
          onInputChanged={() => onWordWrapChanged(!wordWrap)}
        >
          Word wrap
        </CheckboxItem>
      </div>
    </div>
  );
}
