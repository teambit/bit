import classNames from 'classnames';
import prettyTime from 'pretty-time';

import { TestRow } from '@teambit/staged-components.test-row';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TestsFiles, TestResult } from '@teambit/tester';
import { TestFileTitle } from './test-file-title';
import { getStatusIcon } from './utils';
import styles from './test-table.module.scss';

export type TestTableProps = {
  testResults: TestsFiles[];
} & React.HTMLAttributes<HTMLDivElement>;

export function TestTable({ testResults }: TestTableProps) {
  if (!testResults || testResults.length === 0) return null;
  return (
    <>
      {testResults.map((testFile, index) => {
        const borderColor = testFile.failed > 0 ? '#e62e5c' : '#37b26c';
        return (
          <div key={index} className={styles.testTable}>
            <TestFileTitle style={{ borderColor }} testFile={testFile} />
            {testFile.tests.map((test) => {
              return <TestLine key={test.name} test={test} />;
            })}
          </div>
        );
      })}
    </>
  );
}

function TestLine({ test }: { test: TestResult }) {
  const durationInNanoSec = test.duration && +test.duration * 1000000;
  const duration = durationInNanoSec !== undefined ? prettyTime(durationInNanoSec, 'ms') : '-';

  return (
    <TestRow className={classNames(styles.testRow, styles[test.status])} content={test.error}>
      <div className={styles.testTitle}>
        <div className={styles.test}>
          {getStatusIcon(test.status)}
          {/* TODO - improve this */}
          <div className={classNames(styles.testBreadcrumbs, test.status !== 'failed' && styles.singleLine)}>
            {test.ancestor.map((a) => (
              <span key={a}>{`${a} > `}</span>
            ))}
            <div>{test.name}</div>
          </div>
        </div>
        <div className={styles.duration}>
          <span>{duration}</span>
          <Icon of="clock" />
        </div>
      </div>
    </TestRow>
  );
}
