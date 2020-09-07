import React from 'react';
import { ThemeContext } from '@teambit/documenter.theme.theme-context';
import { LinkedHeading } from '@teambit/documenter.ui.linked-heading';
import { Section } from '@teambit/documenter.ui.section';

export const abstract = 'A base for concrete implementations of environments.';

export default () => {
  return (
    <ThemeContext>
      <>
        <Section>
          <LinkedHeading link="introduction">Introduction</LinkedHeading>
          <p>The Enviornment aspect serves as a base for concrete implementations of environments.</p>
          <p>
            These implementations group and orchestrate a set of functions and dependencies that support a component’s
            entire life-cycle.
          </p>
          <p>
            In a nutshell, an implemented environment enable us to dive right into the code, without having to think
            about frameworks, testing libraries, CI pipelines, etc. - it is all pre-configured and standardized.
          </p>
        </Section>
        <Section>
          <LinkedHeading link="workspace-config">
            Workspace Configuration (using and implemented environment)
          </LinkedHeading>
          <p>
            Use the ‘variants’ field to select a group of components by their common directory, and set an environment
            for them (use the ‘*’ sign, instead, to select all components in the workspace).
          </p>
          <p>For example:</p>
          <pre>
            {`
                    {
                        "@teambit/variants": {
                          "components/basic-ui": {
                             "@teambit/react": {}
                            },
                          "helpers": {
                            "@teambit/node": {}
                          }
                        }
                      }
                      
                    `}
          </pre>
          <p>
            Some environments may expose an API for configurations. For example, the environment below accpets either
            ‘babel’ or ‘typescipt’ as a compiler.
          </p>
          <pre>
            {`{
                        "@teambit/variants": {
                          "components/basic-ui": {
                             "@teambit/react": {
                          “compiler”: “typescript”
                      }
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
