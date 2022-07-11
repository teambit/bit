import React, { HTMLAttributes } from 'react';
import { gql, useQuery, useSubscription } from '@apollo/client';
import { ComponentModel } from '@teambit/component';
import { EmptyStateSlot } from '@teambit/compositions';
import { TestLoader } from '@teambit/defender.ui.test-loader';
import { TestTable } from '@teambit/defender.ui.test-table';
import { AlertCard } from '@teambit/design.ui.alert-card';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { styles } from '@teambit/tester';
import classNames from 'classnames';

export type CompareTestsPageProps = {
  component: ComponentModel;
  emptyState: EmptyStateSlot;
  isCompareVersionWorkspace?: boolean;
} & HTMLAttributes<HTMLDivElement>;

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
          errorStr
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
  query ($id: String!) {
    getHost {
      id # for GQL caching
      getTests(id: $id) {
        loading
        testsResults {
          testFiles {
            file
            duration
            pass
            failed
            pending
            errorStr
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

export function CompareTestsPage(props: CompareTestsPageProps) {
  const { component, emptyState, className, isCompareVersionWorkspace } = props;

  const id = !isCompareVersionWorkspace ? component.id.toString() : component.id.toStringWithoutVersion();

  const onTestsChanged = useSubscription(TESTS_SUBSCRIPTION_CHANGED, { variables: { id } });

  const { data } = useQuery(GET_COMPONENT, {
    variables: { id },
  });

  const testData = onTestsChanged.data?.testsChanged || data?.getHost?.getTests;
  const testResults = testData?.testsResults?.testFiles;

  // TODO: change loading EmptyBox
  if (testData?.loading) return <TestLoader />;

  const env = component.environment?.id;
  const EmptyStateTemplate = emptyState.get(env || '');

  if (
    (testResults === null || testData?.testsResults === null) &&
    component.host === 'teambit.workspace/workspace' &&
    EmptyStateTemplate
  ) {
    return (
      <div className={classNames(styles.testsPage, className)}>
        <div>
          <AlertCard
            level="info"
            title="There are no
                    tests for this Component. Learn how to add tests:"
          >
            <MDXLayout>
              <EmptyStateTemplate />
            </MDXLayout>
          </AlertCard>
        </div>
      </div>
    );
  }

  // TODO: get the docs domain from the community aspect and pass it here as a prop
  if (testResults === null || testData?.testsResults === null) {
    return (
      <EmptyBox
        title="This component doesn’t have any tests."
        linkText="Learn how to add tests to your components"
        link={`https://bit.dev/docs/dev-services-overview/tester/tester-overview`}
      />
    );
  }

  return (
    <div className={classNames(styles.testsPage, className)}>
      <div>
        <TestTable testResults={testResults} className={styles.testBlock} />
      </div>
    </div>
  );
}
