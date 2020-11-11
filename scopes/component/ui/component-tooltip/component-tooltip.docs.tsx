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
        <Section>
          This component is used by component-status-resolver to show descriptive tooltip when hovering over the status
          icons.
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

export const Center = ({ children }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
};

Overview.abstract = 'A UI component to show a tooltip.';

Overview.labels = ['react', 'typescript', 'tooltip'];

Overview.examples = [
  {
    scope: {
      StatusProps,
      Center,
      StatusTooltip,
    },
    title: 'New status',
    description: 'Using the Component Tooltip component with new status',
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
];
