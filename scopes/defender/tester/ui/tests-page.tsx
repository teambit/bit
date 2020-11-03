import { useSubscription, useQuery } from '@apollo/react-hooks';
import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/documenter.ui.separator';
import { EmptyBox } from '@teambit/ui.empty-box';
import classNames from 'classnames';
import { gql } from 'apollo-boost';
import React, { HTMLAttributes, useContext } from 'react';
import { TestTable } from '@teambit/ui.test-table';

import styles from './tests-page.module.scss';

const TESTS_SUBSCRIPTION_CHANGED = gql`
  subscription OnTestsChanged($id: String!) {
    testsChanged(id: $id) {
      testsResults {
        testFiles {
          file
          duration
          pass
          failed
          pending
          tests {
            ancestor
            duration
            status
            name
            error
          }
        }
      }
    }
  }
`;

const GET_COMPONENT = gql`
  query($id: String!) {
    getHost {
      getTests(id: $id) {
        loading
        testsResults {
          testFiles {
            file
            duration
            pass
            failed
            pending
            tests {
              ancestor
              duration
              status
              name
              error
            }
          }
        }
      }
    }
  }
`;

type TestsPageProps = {} & HTMLAttributes<HTMLDivElement>;

export function TestsPage({ className }: TestsPageProps) {
  const component = useContext(ComponentContext);
  const onTestsChanged = useSubscription(TESTS_SUBSCRIPTION_CHANGED, { variables: { id: component.id.toString() } });
  const { data } = useQuery(GET_COMPONENT, {
    variables: { id: component.id._legacy.name },
  });

  // TODO: change loading EmptyBox
  if (data?.getHost?.getTests?.loading)
    return (
      <EmptyBox
        title="This test are loading"
        linkText="Learn how to add tests to your components"
        link="https://bit-new-docs.netlify.app/docs/testing/test-components"
      />
    );
  const testResults =
    onTestsChanged.data?.testsChanged.testsResults.testFiles || data?.getHost?.getTests?.testsResults?.testFiles;
  if (testResults === null) {
    return (
      <EmptyBox
        title="This component doesn’t have any test."
        linkText="Learn how to add tests to your components"
        link="https://bit-new-docs.netlify.app/docs/testing/test-components"
      />
    );
  }

  return (
    <div className={classNames(styles.testsPage, className)}>
      <div>
        <H1 className={styles.title}>Tests</H1>
        <Separator className={styles.separator} />
        <TestTable testResults={testResults} className={styles.testBlock} />
      </div>
    </div>
  );
}
