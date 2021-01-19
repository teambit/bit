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
          The version-dropdown displays the latest version of the viewed component. <br />
          If previous versions are available, the component will display a list of them, when clicked. <br />
          This allows the user to navigate to previous versions, and explore them.
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'The version-dropdown lists the latest and previous versions of the viewed component.';

Overview.labels = ['react', 'typescript', 'version', 'dropdown'];

const style = { display: 'flex', justifyContent: 'center', alignContent: 'center' };

Overview.examples = [
  {
    scope: {
      VersionDropdown,
      style,
    },
    title: 'Version Dropdown',
    description: 'Using the Version Dropdown component with one verion',
    code: `
    () => {
      return (
        <div style={{...style, minHeight: 150 }}>
          <VersionDropdown versions={['0.1']} currentVersion="0.1" />
        </div>
      );
    }
      `,
  },
  {
    scope: {
      VersionDropdown,
      style,
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
        <div style={{...style, minHeight: 400, alignItems: 'end', justifyContent: 'flex-end', margin: 10 }}>
          <Router history={history}>
            <VersionDropdown versions={versions} currentVersion={versions[0]} />
          </Router>
        </div>
      );
    }
      `,
  },
];
