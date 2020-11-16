import React from 'react';
import { Router } from 'react-router-dom';
import { createBrowserHistory } from 'history';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { VersionDropdown } from './version-dropdown';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>
          The version-dropdown displays the latest version of the viewed component. If previous versions are available,
          the component will display a list of them, when clicked. This allows the user to navigate to previous
          versions, and explore them.
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

export const Center = ({ children }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
};

Overview.abstract = 'The version-dropdown lists the latest and previous versions of the viewed component.';

Overview.labels = ['react', 'typescript', 'version', 'dropdown'];

Overview.examples = [
  {
    scope: {
      Center,
      VersionDropdown,
    },
    title: 'Version Dropdown',
    description: 'Using the Version Dropdown component with one verion',
    code: `
    () => {
      return (
        <Center>
          <VersionDropdown versions={['0.1']} currentVersion="0.1" />
        </Center>
      );
    }
      `,
  },
  {
    scope: {
      Center,
      VersionDropdown,
      Router,
      createBrowserHistory,
    },
    title: 'Version Dropdown with multiple versions',
    description: 'Using the Version Dropdown component with more than one version',
    code: `
    () => {
      const history = createBrowserHistory();
      const versions = ['0.3', '0.2', '0.1'];
      return (
        <Center>
          <Router history={history}>
            <VersionDropdown versions={versions} currentVersion={versions[0]} />
          </Router>
        </Center>
      );
    }
      `,
  },
];
