import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { List } from '@teambit/documenter.ui.list';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { Separator } from '@teambit/documenter.ui.separator';

export const abstract = 'A dependency manager for components.';

export default () => {
  return (
    <ThemeContext>
      <>
        <Section>
          <LinkedHeading link="introduction">Introduction</LinkedHeading>
          <Paragraph>
            The Dependency Resolver determines the dependency graph of each component tracked by Bit.
          </Paragraph>
          <List spacing="lg">
            {[
              `It performs static-code analysis to locate and parse all ‘import’/’require’ statements in the component’s files.`,
              <>
                {`It determines whether a dependency is a “devDependency” or a [runtime] “dependency”.This is done by inspecting whether the type of file requiring the module is used for runtime or just for development (for example, component.test.js).`}
              </>,
              `It reviews the workspace configuration to check if a specific version was set for this dependency.`,
            ]}
          </List>
          <Paragraph>
            In addition to the above, whenever two components or more, require the same module but of a different
            version, the dependency resolver installs these packages (of different versions) in a more nested or
            "specific" directory. By doing so, it makes use of NPM’s “natural behavior” of searching for packages from
            the component directory upwards (and stop on the first hit). This resolves in providing every component with
            the verion it needs.
          </Paragraph>
        </Section>

        <Separator />

        <Section>
          <LinkedHeading link="workspace-config">Workspace Configuration</LinkedHeading>
          <Paragraph>
            The dependency resolver object inside the workspace.jsonc configuration file has the following fields:
          </Paragraph>
          <List spacing="lg">
            {[
              <>
                <HighlightedText>policy</HighlightedText>
                {` determines the versions of the dependencies to be used by components in the workspace (either a version of a package or a component)`}
                .
              </>,
              <>
                <HighlightedText>packageManager</HighlightedText>
                {` determines the package manager to be by used by the workspace. Choose between 'npm', 'yarn', or 'pnpm'.`}
              </>,
              <>
                <HighlightedText>strictPeerDependencies</HighlightedText>
                {` determines whether to throw an error (instead of a warning) when a peer dependency is missing. The default value is set to ‘false’ (warning).`}
              </>,
              <>
                <HighlightedText>packageManagerArgs</HighlightedText>
                {``}
              </>,
            ]}
          </List>
          <Paragraph>For example:</Paragraph>
          <CodeSnippet>
            {`
"teambit.bit/dependency-resolver": {
    "policy" : {
        "dependencies": {
        "lodash": "1.2.3",
        "teambit.bit/my-awesome-component": "1.1.1"
        }
    }
    "packageManager": "pnpm",
    "strictPeerDependencies": true,
    "packageManagerArgs": []
    }
`}
          </CodeSnippet>
          <Paragraph style={{ marginTop: '30px' }}>
            The dependency resolver can be nested inside the “variants” field to define a policy for a more limited set
            of components.
          </Paragraph>
          <Paragraph style={{ marginBottom: '30px' }}>
            For example, the code snippet below will configure components under the “hooks” directory to use version
            1.0.0 of “lodash” (this configuration will override any less-specific selection of components. This includes
            configurations done on the workspace-level, outside the “variants” field).
          </Paragraph>
          <CodeSnippet>
            {`
"teambit.bit/variants": {
    "hooks/*": {
        "@teambit/dependency-resolver": {
        "dependencies": {
            "lodash": "1.0.0",
        }
        }
    }                            
`}
          </CodeSnippet>
        </Section>
        <Section>
          <LinkedHeading link="slots">Slots</LinkedHeading>
        </Section>
        <Section>
          <LinkedHeading link="extend">Extending and Customizing</LinkedHeading>
        </Section>
      </>
    </ThemeContext>
  );
};
