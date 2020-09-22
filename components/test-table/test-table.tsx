import classNames from 'classnames';
import prettyTime from 'pretty-time';

import { TestRow } from '@teambit/staged-components.test-row';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TestsFiles, TestResult } from '@teambit/tester';
import { TestFileTitle } from './test-file-title';
import { getStatusIcon, getBorderColor } from './utils';
import styles from './test-table.module.scss';

export type TestTableProps = {
  testResults: TestsFiles[];
} & React.HTMLAttributes<HTMLDivElement>;

export function TestTable({ testResults, className }: TestTableProps) {
  if (!testResults || testResults.length === 0) return null;
  return (
    <>
      {testResults.map((testFile, index) => {
        const { pass, failed, pending } = testFile;

        const borderColor = getBorderColor(pass, failed, pending);
        return (
          <div key={index} className={styles.testTable}>
            <TestFileTitle style={{ borderColor: borderColor }} testFile={testFile} />
            {testFile.tests.map((test, index) => {
              return <TestLine key={index} test={test} />;
            })}
          </div>
        );
      })}
    </>
  );
}

function TestLine({ test }: { test: TestResult }) {
  const durationInNanoSec = test.duration && +test.duration * 1000000;
  const duration = durationInNanoSec != undefined ? prettyTime(durationInNanoSec, 'ms') : '-';

  return (
    <TestRow className={classNames(styles.testRow, styles[test.status])} content={test.error}>
      <div className={styles.testTitle}>
        <div className={styles.test}>
          {getStatusIcon(test.status)}
          <div>
            {test.ancestor.map((a) => (
              <span>{`${a} > `}</span>
            ))}
            <div>{test.name}</div>
          </div>
        </div>
        <div className={styles.duration}>
          <span>{duration}</span>
          <Icon of="changelog" />
        </div>
      </div>
    </TestRow>
  );
}
