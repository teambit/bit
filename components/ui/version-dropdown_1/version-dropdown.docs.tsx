import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Separator } from '@teambit/documenter.ui.separator';
import { VersionDropdown } from './version-dropdown';

export default function Overview() {
  return (
    <ThemeCompositions>
      <>
        <Section>
          The version-dropdown displays the latest version of the viewed component. <br />
          If previous versions are available, the component will display a list of them, when clicked. <br />
          This allows the user to navigate to previous versions, and explore them.
        </Section>
        <Separator />
      </>
    </ThemeCompositions>
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
      MemoryRouter,
    },
    title: 'Version Dropdown with multiple versions',
    description: 'Using the Version Dropdown component with more than one version',
    code: `
    () => {
      const versions = ['0.3', '0.2', '0.1'];
      return (
        <div style={{...style, minHeight: 400, alignItems: 'end', justifyContent: 'flex-end', margin: 10 }}>
          <MemoryRouter>
            <VersionDropdown versions={versions} currentVersion={versions[0]} />
          </MemoryRouter>
        </div>
      );
    }
      `,
  },
];
