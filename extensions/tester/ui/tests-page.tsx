import { ComponentContext } from '@teambit/component';
import { H1 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/documenter.ui.separator';
import { EmptyBox } from '@teambit/staged-components.empty-box';
import classNames from 'classnames';
import { gql } from 'apollo-boost';
import React, { HTMLAttributes, useContext } from 'react';

import { useQuery } from '@apollo/react-hooks';

import { TestTable } from '@teambit/staged-components.test-table';
import { TestErrors } from '@teambit/staged-components.test-errors';
import styles from './tests-page.module.scss';

const GET_COMPONENT = gql`
  query($id: String!) {
    getHost {
      getTests(id: $id) {
        errors {
          failureMessage
          file
        }
        tests {
          duration
          status
          name
          file
          error
        }
      }
    }
  }
`;

type TestsPageProps = {} & HTMLAttributes<HTMLDivElement>;

export function TestsPage({ className }: TestsPageProps) {
  const component = useContext(ComponentContext);
  const { data } = useQuery(GET_COMPONENT, {
    variables: { id: component.id._legacy.name },
  });

  if (!data) return null;

  const testResults = data?.getHost?.getTests;

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
      <H1 className={styles.title}>Tests</H1>
      <Separator className={styles.separator} />
      <TestTable tests={testResults?.tests} />
      <TestErrors errors={testResults?.errors} />
    </div>
  );
}
