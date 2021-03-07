import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { StatusTooltip } from './component-tooltip';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>The tooltip handles the presentation of the status as well (modified, errors etc.)</Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'Tooltip status';

Overview.labels = ['react', 'typescript', 'tooltip'];

const style = { display: 'flex', justifyContent: 'center', alignContent: 'center', margin: 8 };

Overview.examples = [
  {
    scope: {
      StatusProps,
      StatusTooltip,
      style,
    },
    title: 'New status',
    description: 'Using the Component Tooltip with new status',
    code: `
    () => {
      const modifyInfo = { hasModifiedFiles: false, hasModifiedDependencies: false };
      const isNew = true;
      const isDeleted = false;
      const isStaged = false;
      const isInWorkspace = false;
      const isInScope = false;
      const nested = false;
      const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
      return (
        <div style={style}>
            <StatusTooltip status={compStatus}>
              N
            </StatusTooltip>
        </div>
      );
    }
      `,
  },
  {
    scope: {
      StatusProps,
      StatusTooltip,
      style,
    },
    title: 'Staged status',
    description: 'Using the Component Tooltip with staged status',
    code: `
    () => {
      const modifyInfo = { hasModifiedFiles: false, hasModifiedDependencies: false };
      const isNew = false;
      const isDeleted = false;
      const isStaged = true;
      const isInWorkspace = false;
      const isInScope = false;
      const nested = false;
      const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
      return (
        <div style={style}>
          <StatusTooltip status={compStatus} >
            S
          </StatusTooltip>
        </div>
      );
    }
      `,
  },
  {
    scope: {
      StatusProps,
      StatusTooltip,
      style,
    },
    title: 'Modified files and dependencies status',
    description: 'Using the Component Tooltip with modified status',
    code: `
    () => {
      const modifyInfo = { hasModifiedFiles: true, hasModifiedDependencies: true };
      const isNew = false;
      const isDeleted = false;
      const isStaged = false;
      const isInWorkspace = false;
      const isInScope = false;
      const nested = false;
      const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
      return (
        <div style={style}>
          <StatusTooltip status={compStatus} >
            M
          </StatusTooltip>
        </div>
      );
    }
      `,
  },
  {
    scope: {
      StatusProps,
      StatusTooltip,
      style,
    },
    title: 'Modified files status and issues',
    description: 'Using the Component Tooltip with modified files and issues',
    code: `
    () => {
      const modifyInfo = { hasModifiedFiles: true, hasModifiedDependencies: false };
      const isNew = false;
      const isDeleted = false;
      const isStaged = false;
      const isInWorkspace = false;
      const isInScope = false;
      const nested = false;
      const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
      return (
        <div style={style}>
          <StatusTooltip status={compStatus} issuesCount={2} >
            M
          </StatusTooltip>
        </div>
      );
    }
      `,
  },
];
