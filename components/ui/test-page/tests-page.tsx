import { useQuery, useSubscription, gql } from '@apollo/client';
import { ComponentContext } from '@teambit/component';
import { useQuery as useRouterQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { H1, H2 } from '@teambit/documenter.ui.heading';
import { Separator } from '@teambit/design.ui.separator';
import { EmptyBox } from '@teambit/design.ui.empty-box';
import { MDXLayout } from '@teambit/mdx.ui.mdx-layout';
import { AlertCard } from '@teambit/design.ui.alert-card';
import { TestLoader } from '@teambit/defender.ui.test-loader';
import { EmptyStateSlot } from '@teambit/tester';
import { useViewedLaneFromUrl } from '@teambit/lanes.hooks.use-viewed-lane-from-url';
import classNames from 'classnames';
import React, { HTMLAttributes, useContext } from 'react';
import { TestTable } from '@teambit/defender.ui.test-table';
import { Table, type ColumnProps } from '@teambit/design.content.table';
import { Link } from '@teambit/base-react.navigation.link';
import styles from './tests-page.module.scss';

type CoverageStats = {
  pct: number
  total: number
  covered: number
  skipped: number
}

type CoverageFile = {
  path: string
  lines: CoverageStats
  statements: CoverageStats
  functions: CoverageStats
  branches: CoverageStats
}

/**
   * Displays the total row with color-coded values
   * 0-25 - red
   * 26-50 - orange
   * 51-75 - yellow
   * 76-100 - green
   */
const getColor = (pct: number) => {
  if (pct < 25) return '#e62e5c';
  if (pct < 50) return 'var(--bit-accent-hunger-color, #BB8C25)';
  if (pct < 75) return 'oklch(85.2% 0.199 91.936)';
  return '#37b26c';
}

const StyledTotalRow: React.FC<{
  row: CoverageFile | undefined | null,
  type: keyof CoverageFile
}> = ({ row, type }) => {
  if (!row) return null;

  const data = row[type] as CoverageStats;

  if (!data) {
    return null;
  };

  return (
    <span style={{ color: getColor(data.pct) }}>
      {data.covered}/{data.total}
    </span>
  )
}

const StyledPctRow: React.FC<{
  row: CoverageFile | undefined | null,
  type: keyof CoverageFile
}> = ({ row, type }) => {
  if (!row) return null;

  const data = row[type] as CoverageStats;

  if (!data) {
    return null;
  };

  return (
    <span style={{ color: getColor(data.pct) }}>
      {data.pct}%
    </span>
  )
}

const columns: ColumnProps<CoverageFile>[] = [
  {
    id: 'path',
    header: 'File',
    cell: ({ row }) => (
      <div className={styles.filePath}>
        <Link href={`../~code/${row?.path}${document.location.search}`}>
          {row?.path}
        </Link>
      </div>
    )
  },
  {
    id: 'progress',
    header: '',
    cell: ({ row }) => (
      <div className={styles.progressBar}>
        <div className={styles.progressBarFill} style={{
            width: `${row?.lines.pct}%`,
            backgroundColor: getColor(row?.lines.pct || 0),
          }}
        />
      </div>
    ),
    value: (file) => file?.lines.pct ? file.lines.pct : 0,
    className: {
      td: styles.coverage_column,
      th: styles.coverage_column,
    }
  },
  {
    id: 'lines',
    header: 'Lines',
    columns: [
      {
        id: 'pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="lines" />,
        value: (file) => file?.lines.pct ? file.lines.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
      {
        id: 'total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="lines" />,
        value: (file) => file?.lines.covered ? file.lines.covered : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
    ]
  },
  {
    id: 'functions',
    header: 'Functions',
    columns: [
      {
        id: 'pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="functions" />,
        value: (file) => file?.functions.pct ? file.functions.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
      {
        id: 'total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="functions" />,
        value: (file) => file?.functions.covered ? file.functions.covered : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
    ]
  },
  {
    id: 'statements',
    header: 'Statements',
    columns: [
      {
        id: 'pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="statements" />,
        value: (file) => file?.statements.pct ? file.statements.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      }, 
      {
        id: 'total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="statements" />,
        value: (file) => file?.statements.covered ? file.statements.covered : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },     
    ]
  },
  {
    id: 'branches',
    header: 'Branches',
    columns: [
      {
        id: 'pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="branches" />,
        value: (file) => file?.branches.pct ? file.branches.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
      {
        id: 'total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="branches" />,
        value: (file) => file?.branches.covered ? file.branches.covered : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },   
    ]
  },
]

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
          coverage {
            path
            lines {
              total
              covered
              skipped
              pct
            }
            functions {
              total
              covered
              skipped
              pct
            }
            statements {
              total
              covered
              skipped
              pct
            }
            branches {
              total
              covered
              skipped
              pct
            }
          }
        }
      }
    }
  }
`;

type CoverageDisplayProps = {
  coverageData: CoverageFile;
};

const CoverageDisplay: React.FC<CoverageDisplayProps> = ({ coverageData }) => {
  const { lines, statements, functions, branches } = coverageData

  const data = [
    { label: "Statements", value: `${statements.covered}/${statements.total}`, pct: statements.pct },
    { label: "Branches", value: `${branches.covered}/${branches.total}`, pct: branches.pct },
    { label: "Functions", value: `${functions.covered}/${functions.total}`, pct: functions.pct },
    { label: "Lines", value: `${lines.covered}/${lines.total}`, pct: lines.pct },
  ]

  return (
    <div className={styles.container}>
      {data.map((item) => (
        <div key={item.label} className={styles.item}>
          <span className={styles.percentage}
            style={{
              color: getColor(item.pct)
            }}
          >
            {item.pct}%
          </span>
          <span className={styles.label}>
            {item.label}
          </span>
          <span className={styles.badge}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

type TestsPageProps = {
  emptyState: EmptyStateSlot;
} & HTMLAttributes<HTMLDivElement>;

export function TestsPage({ className, emptyState }: TestsPageProps) {
  const query = useRouterQuery();

  const component = useContext(ComponentContext);
  const viewedLaneFromUrl = useViewedLaneFromUrl();

  const queryHasVersion = query.get('version');

  // when viewing component tests outside of a lane without a specific version, we want to show the tests of the latest version of the component
  // otherwise, we want to show the tests of the version that is currently viewed
  const id = queryHasVersion || viewedLaneFromUrl ? component.id.toString() : component.id.toStringWithoutVersion();

  const onTestsChanged = useSubscription(TESTS_SUBSCRIPTION_CHANGED, {
    variables: { id },
  });

  const { data } = useQuery(GET_COMPONENT, {
    variables: { id },
  });

  const testData = onTestsChanged.data?.testsChanged || data?.getHost?.getTests;
  const testResults = testData?.testsResults?.testFiles;
  const testCoverage = testData?.testsResults?.coverage as CoverageFile[];

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
          <H1 className={styles.title}>Tests</H1>
          <Separator isPresentational className={styles.separator} />
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
        link={`https://bit.dev/reference/dev-services-overview/tester/tester-overview`}
      />
    );
  }

  const totalCoverage = testCoverage?.find((file) => file.path === 'total') || null;

  return (
    <div className={classNames(styles.testsPage, className)}>
      <div>
        <H1 className={styles.title}>Tests</H1>
        <Separator isPresentational className={styles.separator} />
        <H2 className={styles.subtitle}>Tests Results</H2>
        <TestTable testResults={testResults} className={styles.testBlock} />
        {testCoverage && testCoverage.length > 0 && (
          <>
            <Separator isPresentational className={styles.separator} />
            <H2 className={styles.subtitle}>Coverage Report</H2>
            {totalCoverage && <CoverageDisplay coverageData={totalCoverage} />}
            <Table<CoverageFile>
              data={testCoverage.filter((file) => file.path !== 'total')}
              columns={columns}
              sorting={{
                enable: true,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
