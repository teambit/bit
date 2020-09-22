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
import { AspectBox } from '@teambit/staged-components.aspect-box';
import styles from './tests-page.module.scss';

const aspects = [
  {
    name: 'teambit.react',
    version: '15.12.4',
    isCore: true,
    icon: 'https://static.bit.dev/bit-logo.svg',
    data: 'jashdkfjalsdf',
    config: 'ajksdhflkjhalsdf',
  },
  {
    name: 'teambit.react',
    version: '15.12.4',
    isCore: false,
    icon: 'https://static.bit.dev/bit-logo.svg',
    data: 'jashdkfjalsdf',
    config: 'ajksdhflkjhalsdf',
  },
];

{
  /* {aspects.map((aspect, index) => (
        <AspectBox {...aspect} key={index} />
      ))} */
}

const GET_COMPONENT = gql`
  query($id: String!) {
    getHost {
      getTests(id: $id) {
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

type TestsPageProps = {} & HTMLAttributes<HTMLDivElement>;

export function TestsPage({ className }: TestsPageProps) {
  const component = useContext(ComponentContext);
  const { data } = useQuery(GET_COMPONENT, {
    variables: { id: component.id._legacy.name },
  });

  if (!data) return null;

  // TODO: create TestsResultList from data
  //const testResults = TestsResultList.from(data?.getHost?.getTests.tests);
  const testResults = data?.getHost?.getTests?.testFiles;

  if (data?.getHost?.getTests === null) {
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
      <TestTable testResults={testResults} className={styles.testBlock} />
    </div>
  );
}
