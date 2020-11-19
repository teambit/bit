import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { VersionLabel } from './version-label';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>
          A label component to signify whether a component is checked out or if a version of it is its latest version.
          <br />
          The components should be placed next to the component version number.
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'A ‘Checked out’/‘Latest’ label component.';

Overview.labels = ['react', 'typescript', 'version', 'label'];

Overview.examples = [
  {
    scope: {
      VersionLabel,
    },
    title: 'Latest label',
    description: 'Show latest label beside the version.',
    jsx: <VersionLabel status="latest" />,
  },
  {
    scope: {
      VersionLabel,
    },
    title: 'Checked Out',
    description: 'Show checked out label beside the version.',
    jsx: <VersionLabel status="checked-out" />,
  },
];
