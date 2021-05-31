import classNames from 'classnames';

import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TestsFiles } from '@teambit/tests-results';
import { timeFormat } from '@teambit/toolbox.time.time-format';
import styles from './test-file-title.module.scss';

type TestFileTitleProps = {
  testFile: TestsFiles;
} & React.HTMLAttributes<HTMLDivElement>;

export function TestFileTitle({ testFile, className, ...rest }: TestFileTitleProps) {
  const { duration, failed, file, pass, pending } = testFile;
  const formattedDuration = duration && timeFormat(duration);

  return (
    <div {...rest} className={classNames(styles.testFileTitle, className)}>
      <div className={styles.testFile}>{file}</div>
      <div className={styles.iconLine}>
        <TestIcon icon="clock" value={formattedDuration} />
        <TestIcon icon="file" value={pass + failed + pending} />
        <TestIcon icon="error-circle" value={failed} className={styles.fail} />
        <TestIcon icon="billing-checkmark" value={pass} className={styles.pass} />
        <TestIcon icon="pending" value={pending} className={styles.pending} />
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
