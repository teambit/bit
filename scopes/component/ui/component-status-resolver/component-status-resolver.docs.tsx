import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { ComponentID } from '@teambit/component';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import { ComponentStatusResolver } from './component-status-resolver';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>
          This component wraps the component-status component and component-tooltip so descriptive tooltip is presented
          when hovering over status icons.
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract =
  'A UI component that handles the presentation  of the component status and allows to present multiple status options.';

Overview.labels = ['react', 'typescript', 'status', 'tooltip'];

const style = { display: 'flex', justifyContent: 'center', alignContent: 'center' };

Overview.examples = [
  {
    scope: {
      ComponentID,
      StatusProps,
      ComponentStatusResolver,
      style,
    },
    title: 'Modified dependencies',
    description: 'Using the Status Resolver component with modified dependencies',
    code: `
    () => {
      // @ts-ignore
      const compId = new ComponentID({ name: 'ui/component-status-resolver-1' }, 'teambit.component');
      const modifyInfo = { hasModifiedFiles: false, hasModifiedDependencies: true };
      const isNew = false;
      const isDeleted = false;
      const isStaged = false;
      const isInWorkspace = false;
      const isInScope = false;
      const nested = false;
      const compStatus = new StatusProps(modifyInfo, isNew, isDeleted, isStaged, isInWorkspace, isInScope, nested);
      return (
        <div style={style}>
          <ComponentStatusResolver id={compId} status={compStatus} />
        </div>
      );
    }
      `,
  },
  {
    scope: {
      ComponentID,
      StatusProps,
      ComponentStatusResolver,
      style,
    },
    title: 'Modified files',
    description: 'Using the Status Resolver component with modified files',
    code: `
    () => {
      // @ts-ignore
      const compId = new ComponentID({ name: 'ui/component-status-resolver-2' }, 'teambit.component');
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
          <ComponentStatusResolver id={compId} status={compStatus} />
        </div>
      );
    }
      `,
  },
  {
    scope: {
      ComponentID,
      StatusProps,
      ComponentStatusResolver,
      style,
    },
    title: 'New status',
    description: 'Using the Status Resolver component with new status',
    code: `
    () => {
      // @ts-ignore
      const compId = new ComponentID({ name: 'ui/component-status-resolver-3' }, 'teambit.component');
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
          <ComponentStatusResolver id={compId} status={compStatus} />
        </div>
      );
    }
      `,
  },
  {
    scope: {
      ComponentID,
      StatusProps,
      ComponentStatusResolver,
      style,
    },
    title: 'Staged status',
    description: 'Using the Status Resolver component with staged status',
    code: `
    () => {
      // @ts-ignore
      const compId = new ComponentID({ name: 'ui/component-status-resolver-4' }, 'teambit.component');
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
          <ComponentStatusResolver id={compId} status={compStatus} />
        </div>
      );
    }
      `,
  },
  {
    scope: {
      ComponentID,
      StatusProps,
      ComponentStatusResolver,
      style,
    },
    title: 'New status and issues',
    description: 'Using the Status Resolver component with new status and issues',
    code: `
    () => {
      // @ts-ignore
      const compId = new ComponentID({ name: 'ui/component-status-resolver-5' }, 'teambit.component');
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
          <ComponentStatusResolver id={compId} status={compStatus} issuesCount={1} />
        </div>
      );
    }
      `,
  },
  {
    scope: {
      ComponentID,
      StatusProps,
      ComponentStatusResolver,
      style,
    },
    title: 'New staged and issues',
    description: 'Using the Status Resolver component with staged status and issues',
    code: `
    () => {
      // @ts-ignore
      const compId = new ComponentID({ name: 'ui/component-status-resolver-6' }, 'teambit.component');
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
          <ComponentStatusResolver id={compId} status={compStatus} issuesCount={1} />
        </div>
      );
    }
      `,
  },
  {
    scope: {
      ComponentID,
      StatusProps,
      ComponentStatusResolver,
      style,
    },
    title: 'Modified files and dependencies with issues',
    description: 'Using the Status Resolver component with modified status and issues',
    code: `
    () => {
      // @ts-ignore
      const compId = new ComponentID({ name: 'ui/component-status-resolver-7' }, 'teambit.component');
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
          <ComponentStatusResolver id={compId} status={compStatus} issuesCount={1} />
        </div>
      );
    }
      `,
  },
];
