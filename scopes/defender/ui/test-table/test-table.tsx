import classNames from 'classnames';
import { TestRow } from '@teambit/defender.ui.test-row';
import { timeFormat } from '@teambit/toolbox.time.time-format';
import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TestsFiles, TestResult } from '@teambit/tests-results';
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
        const testHasErrors = testFile?.error?.failureMessage;
        const borderColor = testFile.failed > 0 || testHasErrors ? '#e62e5c' : '#37b26c';
        return (
          <div key={index} className={styles.testTable}>
            <TestFileTitle style={{ borderColor }} testFile={testFile} />
            {testHasErrors && <TestSuiteError key={testHasErrors} name={testFile.file} error={testHasErrors} />}
            {!testHasErrors &&
              testFile.tests.map((test) => {
                return <TestLine key={test.name} test={test} />;
              })}
          </div>
        );
      })}
    </>
  );
}

function TestLine({ test }: { test: TestResult }) {
  const duration = test.duration && timeFormat(+test.duration);

  return (
    <TestRow className={classNames(styles.testRow, styles[test.status])} content={test.error}>
      <div className={styles.testTitle}>
        <div className={styles.test}>
          {getStatusIcon(test.status)}
          <TestBreadcrumbs test={test} />
        </div>
        <div className={styles.duration}>
          <span>{duration}</span>
          <Icon of="clock" />
        </div>
      </div>
    </TestRow>
  );
}

function TestSuiteError({ name, error }: { name: string; error: string }) {
  return (
    <TestRow className={classNames(styles.testRow, styles.failed)} content={error}>
      <div className={styles.testTitle}>
        <div className={styles.test}>
          {getStatusIcon('failed')}
          <div>{name}</div>
        </div>
      </div>
    </TestRow>
  );
}

function TestBreadcrumbs({ test }: { test: TestResult }) {
  if (test.status === 'failed') {
    const nameIndentVal = test.ancestor.length * 8;
    return (
      <div className={classNames(styles.testBreadcrumbs)}>
        {test.ancestor.map((a) => {
          const indentVal = test.ancestor.indexOf(a) * 8;
          return <div style={{ paddingLeft: `${indentVal}px` }} key={a}>{`${a}`}</div>;
        })}
        <div style={{ paddingLeft: `${nameIndentVal}px` }}>{test.name}</div>
      </div>
    );
  }
  return (
    <div className={classNames(styles.testBreadcrumbs, styles.singleLine)}>
      {test.ancestor.map((a) => {
        return <span key={a}>{`${a} > `}</span>;
      })}
      <div>{test.name}</div>
    </div>
  );
}
