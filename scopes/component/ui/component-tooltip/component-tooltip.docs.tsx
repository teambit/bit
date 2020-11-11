import React from 'react';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { StatusTooltip } from './component-tooltip';

export default function Overview() {
  return null;
}

export const Center = ({ children }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
};

Overview.abstract = 'The tooltip handles the presentation of the status as well (modified, errors etc.)';

Overview.labels = ['react', 'typescript', 'tooltip'];

Overview.examples = [
  {
    scope: {
      StatusProps,
      Center,
      StatusTooltip,
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
        <Center>
          <div data-tip="" data-for="1">
            N
            <StatusTooltip status={compStatus} name="1" />
          </div>
        </Center>
      );
    }
      `,
  },
  {
    scope: {
      StatusProps,
      Center,
      StatusTooltip,
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
        <Center>
          <div data-tip="" data-for="2">
            S
            <StatusTooltip status={compStatus} name="2" />
          </div>
        </Center>
      );
    }
      `,
  },
  {
    scope: {
      StatusProps,
      Center,
      StatusTooltip,
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
        <Center>
          <div data-tip="" data-for="3">
            M
            <StatusTooltip status={compStatus} name="3" />
          </div>
        </Center>
      );
    }
      `,
  },
  {
    scope: {
      StatusProps,
      Center,
      StatusTooltip,
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
        <Center>
          <div data-tip="" data-for="4">
            M
            <StatusTooltip status={compStatus} name="4" issuesCount={2} />
          </div>
        </Center>
      );
    }
      `,
  },
];
