import { ComponentTemplate } from '@teambit/generator';
import { starterTemplate } from '../starter';

// TODO: This is deprecated and should be removed once we update the docs to use the new starter template.
export const workspaceGeneratorTemplate: ComponentTemplate = {
  ...starterTemplate,
  name: 'workspace-generator',
  description:
    'DEPRECATED: use "starter" instead.\ncreate your own workspace generator - \nDocs: https://bit.dev/docs/dev-services/generator/generate-workspace',
};
