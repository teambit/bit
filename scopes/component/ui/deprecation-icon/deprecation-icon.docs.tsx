import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { Separator } from '@teambit/documenter.ui.separator';
import { ComponentModel } from '@teambit/component';
import { DeprecationIcon } from './deprecation-icon';

export default function Overview() {
  return (
    <ThemeContext>
      <>
        <Section>
          The icon shows when the component is deprecated, and if it isn't, the DeprecationIcon will return null.
        </Section>
        <Separator />
      </>
    </ThemeContext>
  );
}

Overview.abstract = 'A component that shows a warning icon when a component is deprecated.';

Overview.labels = ['react', 'typescript', 'icon', 'deprecate'];

const style = { display: 'flex', justifyContent: 'center', alignContent: 'center' };

Overview.examples = [
  {
    scope: {
      ComponentModel,
      DeprecationIcon,
      style,
    },
    title: 'Deprecated icon',
    description: 'Using the Deprecation Icon with a deprecated component',
    code: `
    () => {
      const deprecation = {
        isDeprecate: true,
      };
      // @ts-ignore
      const component = new ComponentModel(null, null, null, null, null, null, null, null, deprecation, null, null);
      return (
        <div style={style}>
          <DeprecationIcon component={component} />
        </div>
      )
    }
      `,
  },
];
