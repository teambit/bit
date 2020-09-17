import classNames from 'classnames';
import prettyTime from 'pretty-time';

import { TestRow } from '@teambit/staged-components.test-row';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TestResult } from '@teambit/tester';
import styles from './test-table.module.scss';

export type TestTableProps = {
  tests: TestResult[];
} & React.HTMLAttributes<HTMLDivElement>;

export function TestTable({ tests, className }: TestTableProps) {
  if (tests.length === 0) return null;

  return (
    <div className={classNames(styles.testTable, className)}>
      <div className={classNames(styles.row, styles.heading)}>
        <div>Test</div>
        <div>Duration</div>
        <div />
      </div>
      {tests.map((test, index) => {
        return <TestLine key={index} test={test} />;
      })}
    </div>
  );
}

function TestLine({ test }: { test: TestResult }) {
  const durationInNanoSec = test.duration && +test.duration * 1000000;
  const duration = durationInNanoSec != undefined ? prettyTime(durationInNanoSec, 'ms') : '-';

  return (
    <TestRow content={test.error}>
      <div className={styles.test}>
        {getStatusIcon(test.status)}
        <div>{test.name}</div>
      </div>
      <div className={styles.duration}>{duration}</div>
      {test.error && <Icon of="arrow-down" />}
    </TestRow>
  );
}

function getStatusIcon(status?: string) {
  if (status === 'passed') {
    return <Icon className={styles.pass} of={'billing-checkmark'} />;
  }

  if (status === 'failed') {
    return <Icon className={styles.fail} of={'error-circle'} />;
  }
  return '';
}
