// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React, { useState, useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Box, Color, Text } from 'ink';
import { Runtime } from './runtime';
// import { EnvConsole } from './components';
// make sure to update eslint to read JSX.
import { Command, CLIArgs } from '../paper';
import { Workspace } from '../workspace';
import { Environments } from './environments.extension';

export class StartCmd implements Command {
  name = 'start [pattern]';
  description = 'start a dev environment for a workspace or a specific component';
  alias = 'c';
  group = 'development';
  shortDescription = '';
  options = [];

  constructor(
    /**
     * access to the extension instance.
     */
    private envs: Environments,

    /**
     * access to workspace.
     */
    private workspace: Workspace
  ) {}

  private clearConsole() {
    process.stdout.write(process.platform === 'win32' ? '\x1B[2J\x1B[0f' : '\x1B[2J\x1B[3J\x1B[H');
  }

  // @ts-ignore TODO: align cli api.
  async render([userPattern]: CLIArgs): Promise<React.ReactElement> {
    // @teambit/variants should be the one to take care of component patterns.
    const pattern = userPattern && userPattern.toString();
    const envRuntime = await this.envs.createEnvironment(pattern ? await this.workspace.byPattern(pattern) : undefined);
    this.clearConsole();
    // @ts-ignore
    envRuntime.dev();
    this.clearConsole();
    return <EnvConsole runtime={envRuntime} />;
  }
}

export function EnvConsole({ runtime }: { runtime: Runtime }) {
  const [, setCounter] = useState(0);

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
      {runtime.runtimeEnvs.map((def, key) => (
        <Box key={key}>
          <Color cyan>starting development environment: {def.id}...</Color>
        </Box>
      ))}
    </Box>
  );
}
