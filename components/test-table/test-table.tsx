import classNames from 'classnames';
import prettyTime from 'pretty-time';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import React, { useState } from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { TestResult } from '@teambit/tester';
import styles from './test-table.module.scss';

export type TestTableProps = {
  tests: TestResult[];
};

export function TestTable({ tests }: TestTableProps) {
  if (tests.length === 0) return null;

  return (
    <div className={styles.testTable}>
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
  const [isOpen, setIsOpen] = useState(false);

  const durationInNanoSec = test.duration && +test.duration * 1000000;
  const duration = durationInNanoSec ? prettyTime(durationInNanoSec, 'ms') : '';

  return (
    <div className={classNames(styles.testBlock, isOpen && styles.hide, test.error && styles.hover)}>
      <div
        className={styles.row}
        onClick={() => {
          if (!test.error) return;
          setIsOpen(!isOpen);
        }}
      >
        <div className={styles.test}>
          {getStatusIcon(test.status)}
          <div>{test.name}</div>
        </div>
        <div className={styles.duration}>{duration}</div>
        {test.error && <Icon of="arrow-down" />}
      </div>
      {test.error && (
        <div className={classNames(styles.log, isOpen && styles.open)}>
          <ThemeContext>
            <CodeSnippet className={styles.snippet}>{test.error}</CodeSnippet>
          </ThemeContext>
        </div>
      )}
    </div>
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
