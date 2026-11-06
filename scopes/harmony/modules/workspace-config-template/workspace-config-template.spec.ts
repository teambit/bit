import { expect } from 'chai';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from './workspace-config-template';

describe('workspace config template', () => {
  it('should parse the template and stringify it with its comments', async () => {
    const config = await getWorkspaceConfigTemplateParsed();
    config['teambit.workspace/workspace'].name = 'my-workspace';
    const content = stringifyWorkspaceConfig(config);
    expect(content).to.include('"name": "my-workspace"');
    expect(content).to.include('this is the main configuration file of your bit workspace');
  });
});
