import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';
import { List } from '@teambit/documenter.ui.list';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { CodeSnippet } from '@teambit/documenter.ui.code-snippet';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import { Subtitle } from '@teambit/documenter.ui.sub-title';

export const abstract = 'A dependency manager for components.';
const listItems = ['sdf', 'asdfa'];
export default () => {
  return (
    <ThemeContext>
      <>
        <Section>
          <CodeSnippet>kajshdfkjhasdkf</CodeSnippet>
          <Paragraph>sdhgfjhsgdjfhs</Paragraph>
          <HighlightedText>jadshfkjad</HighlightedText>
          <Subtitle>jkasdhfkjhaksdf</Subtitle>
          <List>{listItems}</List>
          <LinkedHeading link="introduction">Introduction</LinkedHeading>
          <p>The Dependency Resolver determines the dependency graph of each component tracked by Bit.</p>
          <ol>
            <li>
              It performs static-code analysis to locate and parse all ‘import’/’require’ statements in the component’s
              files.
            </li>
            <li>
              It determines whether a dependency is a “devDependency” or a [runtime] “dependency”. This is done by
              inspecting whether the type of file requiring the module is used for runtime or just for development (e.g,
              component.test.js).
            </li>
            <li>It reviews the workspace configuration to check if a specific version was set for this dependency.</li>
          </ol>
          <p>
            In addition to that, whenever two components or more, require the same module but of a different version,
            the dependency resolver installs these packages (of different versions) in a more nested or "specific"
            directory, thus making use of NPM’s “natural behavior” of searching for packages by propagating upwards, to
            provide each component with the right version.
          </p>
        </Section>
        <Section>
          <LinkedHeading link="workspace-config">Workspace Configuration</LinkedHeading>
          <p>The dependency resolver object inside the workspace.jsonc configuration file has the following fields:</p>
          <ul>
            <li>
              “policy”: Determines the versions of the dependencies to be used by components in the workspace (either a
              version of a package or a component).
            </li>
            <li>
              “packageManager”: Determines the package manager to be by used the workspace. Choose between 'npm',
              'yarn', or 'pnpm'.
            </li>
            <li>
              “strictPeerDependencies”: When is set to ‘true’, Bit will throw an error, instead of a warning, when a
              peer dependency is missing. The default value is set to ‘false’.
            </li>
            <li>"packageManagerArgs"</li>
          </ul>
          <p>For example:</p>
          <pre>
            {`"teambit.bit/dependency-resolver": {
                                "policy" : {
                                  "dependencies": {
                                    "lodash": "1.2.3",
                                    "teambit.bit/my-awesome-component": "1.1.1"
                                  }
                                }
                                "packageManager": "pnpm",
                                "strictPeerDependencies": true,
                                "packageManagerArgs": []
                              }`}
          </pre>
          <p>
            The dependency resolver can be nested inside the “variants” field to define a policy for a more limited set
            of components.
          </p>
          <p>
            For example, the code snippet below will configure components under the “hooks” directory to use version
            1.0.0 of “lodash” (this configuration will override any less-specific selection of components. This includes
            configurations done on the workspace-level, outside the “variants” field).
          </p>
          <pre>
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
          </pre>
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
