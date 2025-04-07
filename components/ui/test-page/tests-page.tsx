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

type CoverageResults = {
  files: CoverageFile[]
  total: CoverageData
}

type CoverageStats = {
  pct: number
  total: number
  covered: number
  skipped: number
}

type CoverageFile = {
  path: string
  data: CoverageData
}

type CoverageData = {
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
  if (pct < 25) return 'var(--bit-accent-impulsive-color)';
  if (pct < 50) return 'oklch(70.5% 0.213 47.604)';
  if (pct < 75) return 'var(--bit-accent-hunger-color)';
  return 'var(--bit-accent-success-color)';
}

const StyledTotalRow: React.FC<{
  row: CoverageFile | undefined | null,
  type: keyof CoverageFile['data']
}> = ({ row, type }) => {
  if (!row) return null;

  const data = row.data[type];;

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
  type: keyof CoverageFile['data']
}> = ({ row, type }) => {
  if (!row) return null;

  const data = row.data[type];

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
            width: `${row?.data?.lines.pct}%`,
            backgroundColor: getColor(row?.data?.lines.pct || 0),
          }}
        />
      </div>
    ),
    value: (file) => file?.data.lines.pct ? file.data.lines.pct : 0,
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
        id: 'lines_pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="lines" />,
        value: (file) => file?.data.lines.pct ? file.data.lines.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
      {
        id: 'lines_total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="lines" />,
        value: (file) => file?.data.lines.covered ? file.data.lines.covered : 0,
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
        id: 'functions_pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="functions" />,
        value: (file) => file?.data.functions.pct ? file.data.functions.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
      {
        id: 'functions_total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="functions" />,
        value: (file) => file?.data.functions.covered ? file.data.functions.covered : 0,
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
        id: 'statements_pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="statements" />,
        value: (file) => file?.data.statements.pct ? file.data.statements.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      }, 
      {
        id: 'statements_total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="statements" />,
        value: (file) => file?.data.statements.covered ? file.data.statements.covered : 0,
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
        id: 'branches_pct',
        header: '%',
        cell: ({ row }) => <StyledPctRow row={row} type="branches" />,
        value: (file) => file?.data.branches.pct ? file.data.branches.pct : 0,
        className: {
          td: styles.coverage_column,
          th: styles.coverage_column,
        }
      },
      {
        id: 'branches_total',
        header: 'Total',
        cell: ({ row }) => <StyledTotalRow row={row} type="branches" />,
        value: (file) => file?.data.branches.covered ? file.data.branches.covered : 0,
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
            total {
              lines {
                total
                covered
                pct
              }
              functions {
                total
                covered
                pct
              }
              statements {
                total
                covered
                pct
              }
              branches {
                total
                covered
                pct
              }
            }
            files {
              path
              data {
                lines {
                  total
                  covered
                  pct
                }
                functions {
                  total
                  covered
                  pct
                }
                statements {
                  total
                  covered
                  pct
                }
                branches {
                  total
                  covered
                  pct
                }
              }
            }
          }
        }
      }
    }
  }
`;

type TotalCoverageSummaryProps = {
  coverageResult: CoverageResults;
};

const TotalCoverageSummary: React.FC<TotalCoverageSummaryProps> = ({ coverageResult }) => {
  const { lines, statements, functions, branches } = coverageResult.total

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

  const { data, loading } = useQuery(GET_COMPONENT, {
    variables: { id },
  });

  const testData = onTestsChanged.data?.testsChanged || data?.getHost?.getTests;
  const testResults = testData?.testsResults?.testFiles;
  const testCoverage = testData?.testsResults?.coverage as CoverageResults;

  // TODO: change loading EmptyBox
  if (loading || testData?.loading) return <TestLoader />;

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

  return (
    <div className={classNames(styles.testsPage, className)}>
      <div>
        <H1 className={styles.title}>Tests</H1>
        <Separator isPresentational className={styles.separator} />
        <H2 className={styles.subtitle}>Tests Results</H2>
        <TestTable testResults={testResults} className={styles.testBlock} />
        {testCoverage && testCoverage.files.length > 0 && (
          <>
            <Separator isPresentational className={styles.separator} />
            <H2 className={styles.subtitle}>Coverage Report</H2>
            <TotalCoverageSummary coverageResult={testCoverage} />
            <Table<CoverageFile>
              data={testCoverage.files}
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
