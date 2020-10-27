import { Command } from '@teambit/cli';

import { UiMain } from './ui.main.runtime';

export class UIBuildCmd implements Command {
  name = 'ui-build [type]';
  description = 'Build production assets for deployment.';
  alias = 'c';
  group = 'component';
  shortDescription = '';
  options = [];

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UiMain
  ) {}

  async report([type]: [string]): Promise<string> {
    // teambit.bit/variants should be the one to take care of component patterns.
    const stats = await this.ui.build(type);
    return stats.toString();
  }
}
