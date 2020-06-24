// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color, Text } from 'ink';
// import { EnvConsole } from './components';
// make sure to update eslint to read JSX.
import { Command } from '../cli';
import { Workspace } from '../workspace';
import { UIExtension } from './ui.extension';

export class StartCmd implements Command {
  name = 'start [pattern]';
  description = 'start a dev environment for a workspace or a specific component';
  alias = 'c';
  private = true;
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(
    /**
     * access to the extension instance.
     */
    private ui: UIExtension,

    /**
     * access to workspace.
     */
    private workspace: Workspace
  ) {}

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  async render([userPattern]: [string]): Promise<React.ReactElement> {
    // @teambit/variants should be the one to take care of component patterns.
    const pattern = userPattern && userPattern.toString();
    const uiRuntime = await this.ui.createRuntime(pattern ? await this.workspace.byPattern(pattern) : undefined);
    this.clearConsole();
    // @ts-ignore
    // uiRuntime.dev();
    this.clearConsole();
    return <EnvConsole runtime={uiRuntime} />;
  }
}

export function EnvConsole(props: any) {
  const [, setCounter] = useState(0);
  props;
  useEffect(() => {
    const timer = setInterval(() => {
      setCounter(previousCounter => previousCounter + 1);
    }, 100);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Box>
      {/* {runtime.runtimeEnvs.map((def, key) => (
        <Box key={key}>
          <Color cyan>starting development environment: {def.id}...</Color>
        </Box>
      ))} */}
    </Box>
  );
}
