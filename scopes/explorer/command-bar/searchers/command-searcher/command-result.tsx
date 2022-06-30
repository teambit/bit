import React from 'react';
import classnames from 'classnames';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { KeySequence } from '@teambit/ui-foundation.ui.keycap';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { Command } from './command';

import styles from './command-result.module.scss';

type CommandResultProps = {
  command: Command;
};

export function CommandResult({ command }: CommandResultProps) {
  const { icon, iconAlt, displayName, keybinding } = command;
  const _keybinding = Array.isArray(keybinding) ? keybinding[0] : keybinding;

  return (
    <>
      {icon && <img src={icon} alt={iconAlt} className={styles.icon} />}
      <div className={classnames(ellipsis, styles.name)}>{displayName}</div>
      {_keybinding && <KeySequence className={classnames(styles.commandKeys, mutedText)}>{_keybinding}</KeySequence>}
    </>
  );
}
