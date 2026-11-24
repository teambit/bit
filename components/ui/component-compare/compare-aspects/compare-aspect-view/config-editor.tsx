import type { HTMLAttributes } from 'react';
import React, { useState } from 'react';
import copy from 'copy-to-clipboard';
import classNames from 'classnames';
import { CopiedMessage } from '@teambit/documenter.ui.copied-message';
import { DiffViewer } from '@teambit/code.ui.diff-viewer';
import { Icon } from '@teambit/design.elements.icon';

import styles from './compare-aspect-view.module.scss';

export type ConfigDiffEditorProps = {
  original?: string;
  modified?: string;
  name?: string;
} & HTMLAttributes<HTMLDivElement>;

export function ConfigDiffEditor({ original = '', modified = '', name = 'aspect config' }: ConfigDiffEditorProps) {
  return (
    <div className={styles.diffWithActions}>
      <div className={styles.copyActions}>
        {original && <CopyButton text={original} label="Copy base config" />}
        {modified && <CopyButton text={modified} label="Copy changed config" />}
      </div>
      <DiffViewer
        className={styles.diffEditor}
        fileName={`${name}.json`}
        oldContent={original}
        newContent={modified}
        language="json"
        defaultView="split"
        showHeader={false}
        collapsible={false}
        maxHeight={420}
        contextLines={unchangedContext(original, modified)}
      />
    </div>
  );
}

/**
 * Unlimited context when both sides are the same: an unchanged config has no change to collapse
 * toward, so the default context would hide all of it behind a single "Expand N unchanged lines".
 */
export function unchangedContext(original: string, modified: string): number | undefined {
  return original === modified ? Number.MAX_SAFE_INTEGER : undefined;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [isCopied, setCopied] = useState(false);

  const handleCopy = () => {
    copy(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={classNames(styles.copyButton, isCopied && styles.isLabelVisible)}
      onClick={handleCopy}
    >
      <Icon className={styles.copyIcon} of="copy-cmp" />
      <CopiedMessage className={styles.message} show={isCopied} />
    </button>
  );
}
