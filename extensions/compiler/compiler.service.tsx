import React from 'react';
import { Text, Newline } from 'ink';
import syntaxHighlighter from 'consolehighlighter';
import { EnvService, Environment } from '@teambit/environments';

export type CompilerDescriptor = {
  id: string;
  icon?: string;
  config: string;
};

export class CompilerService implements EnvService<{}, CompilerDescriptor> {
  name = 'Compile';

  render(env: Environment) {
    const descriptor = this.getDescriptor(env);

    return (
      <Text key={descriptor?.id}>
        <Text color="cyan">configured compiler: </Text>
        <Text>{descriptor?.id}</Text>
        <Newline />
        <Text color="cyan">compiler config:</Text>
        <Newline />
        <Text>
          {descriptor?.config && syntaxHighlighter.highlight(JSON.stringify(descriptor?.config, null, 4), 'javascript')}
        </Text>
      </Text>
    );
  }

  getDescriptor(env: Environment) {
    if (!env.getCompiler) return undefined;
    const compiler = env.getCompiler();

    return {
      id: compiler.id,
      icon: compiler.icon,
      config: compiler.displayConfig ? compiler.displayConfig() : undefined,
    };
  }
}
