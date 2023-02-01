import React, { HTMLAttributes } from 'react';
import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
import classnames from 'classnames';

import styles from './code-editor-settings.module.scss';

export type EditorSettingsHooks = {
  onWordWrapChanged: (wordWrap: boolean) => void;
};
export type EditorSettingsState = {
  wordWrap: boolean;
};
export type EditorSettings = EditorSettingsHooks & EditorSettingsState;

export type CodeEditorSettingsProps = {} & HTMLAttributes<HTMLDivElement> & EditorSettings;

export function CodeEditorSettings({ wordWrap, onWordWrapChanged, className, ...rest }: CodeEditorSettingsProps) {
  return (
    <div {...rest} className={classnames(styles.settingsMenu, className)}>
      <div className={styles.settingsTitle}>Code View</div>
      <div className={styles.wordWrapSettings}>
        <CheckboxItem checked={wordWrap} onInputChanged={() => onWordWrapChanged(!wordWrap)}>
          Word wrap
        </CheckboxItem>
      </div>
    </div>
  );
}
