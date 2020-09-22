import classNames from 'classnames';
import prettyTime from 'pretty-time';

import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TestsFiles } from '@teambit/tester';
import styles from './test-file-title.module.scss';

type TestFileTitleProps = {
  testFile: TestsFiles;
} & React.HTMLAttributes<HTMLDivElement>;

export function TestFileTitle({ testFile, className, ...rest }: TestFileTitleProps) {
  const { duration, failed, file, pass, pending } = testFile;
  const durationInNanoSec = duration && duration * 1000000;
  const formattedDuration = durationInNanoSec != undefined ? prettyTime(durationInNanoSec, 'ms') : '-';
  return (
    <div {...rest} className={classNames(styles.testFileTitle, className)}>
      <div className={styles.testFile}>{file}</div>
      <div className={styles.iconLine}>
        <TestIcon icon="changelog" value={formattedDuration} />
        <TestIcon icon="floppy" value={pass + failed + pending} />
        <TestIcon icon="billing-checkmark" value={pass} className={styles.pass} />
        <TestIcon icon="error-circle" value={failed} className={styles.fail} />
        <TestIcon icon="spinner" value={pending} className={styles.pending} />
      </div>
    </div>
  );
}

export type TestIconProps = {
  icon: string;
  value?: number;
} & React.HTMLAttributes<HTMLDivElement>;

function TestIcon({ icon, value, className, ...rest }: TestIconProps) {
  if (!value) return null;
  return (
    <div {...rest} className={classNames(styles.testIcon, className)}>
      <Icon of={icon} className={styles.icon} />
      <span>{value}</span>
    </div>
  );
}
