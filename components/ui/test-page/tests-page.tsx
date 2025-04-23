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
import { Table, type ColumnProps, type CellFunctionProps } from '@teambit/design.content.table';
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
  if (pct < 25) return 'var(--negative-color)';
  if (pct < 50) return 'var(--warning-color)';
  if (pct < 75) return '#EEB90F';
  return 'var(--positive-color)';
}

const StyledRow: React.FC<{
  row: CoverageFile | undefined | null,
  type: keyof CoverageFile['data'],
  displayValue: (data: CoverageFile['data'][keyof CoverageFile['data']]) => string
}> = ({ row, type, displayValue }) => {
  if (!row) return null;

  const data = row.data[type];

  if (!data) {
    return null;
  }

  return (
    <span style={{ color: getColor(data.pct) }}>
      {displayValue(data)}
    </span>
  )
}

const StyledTotalRow = (props: { row: CoverageFile | undefined | null, type: keyof CoverageFile['data'] }) => (
  <StyledRow {...props} displayValue={data => `${data.covered}/${data.total}`} />
);

const StyledPctRow = (props: { row: CoverageFile | undefined | null, type: keyof CoverageFile['data'] }) => (
  <StyledRow {...props} displayValue={data => `${data.pct}%`} />
);

const createColumn = (id: string, header: string, type: keyof CoverageFile['data']) => [
  {
    id: `${id}_pct`,
    header: '%',
    cell: ({ row }: CellFunctionProps<CoverageFile>) => (
      row ? <StyledPctRow row={row} type={type} /> : null
    ),
    value: (row?: CoverageFile) => row?.data[type].pct ?? 0,
    className: {
      td: styles.coverage_column,
      th: styles.coverage_column,
    }
  },
  {
    id: `${id}_total`,
    header: 'Total',
    cell: ({ row }: CellFunctionProps<CoverageFile>) => (
      row ? <StyledTotalRow row={row} type={type} /> : null
    ),
    value: (row?: CoverageFile) => row?.data[type].covered ?? 0,
    className: {
      td: styles.coverage_column,
      th: styles.coverage_column,
    }
  },
];

const calculatePercentage = (data: CoverageData) => {
  const covered = data.lines.covered 
    + data.branches.covered
    + data.functions.covered
    + data.statements.covered;

  const total = data.lines.total 
    + data.branches.total
    + data.functions.total
    + data.statements.total;
  return (covered / total) * 100;
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
    header: 'Overall',
    cell: ({ row }) => {
      if (!row) {
        return null;
      }

      const coveredPercentage = calculatePercentage(row?.data);
      
      return (
        <div className={styles.summaryProgressBar}>
          <div className={styles.progressBarFill} style={{
              width: `${coveredPercentage}%`,
              backgroundColor: getColor(coveredPercentage)
            }}
          />
        </div>
      )
    },
    value: (file) => file?.data.lines.pct ?? 0,
    className: {
      td: styles.coverage_column,
      th: styles.coverage_column,
    }
  },
  {
    id: 'lines',
    header: 'Lines',
    columns: createColumn('lines', 'Lines', 'lines')
  },
  {
    id: 'functions',
    header: 'Functions',
    columns: createColumn('functions', 'Functions', 'functions')
  },
  {
    id: 'statements',
    header: 'Statements',
    columns: createColumn('statements', 'Statements', 'statements')
  },
  {
    id: 'branches',
    header: 'Branches',
    columns: createColumn('branches', 'Branches', 'branches')
  },
];

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

  const totalCovered = lines.covered + branches.covered + functions.covered + statements.covered;
  const totalLines = lines.total + branches.total + functions.total + statements.total;

  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: "20px" }}>
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
      {/** Display a progress bar for the total */}
      <div className={styles.summaryProgressBar}>
        <div className={styles.progressBarFill} style={{
            width: `${totalCovered / totalLines * 100}%`,
            backgroundColor: getColor(totalCovered / totalLines * 100)
          }}
        />
      </div>
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
