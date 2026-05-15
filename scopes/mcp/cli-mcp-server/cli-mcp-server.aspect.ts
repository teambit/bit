import { Aspect } from '@teambit/core';

export const CliMcpServerAspect = Aspect.create({
  id: 'teambit.mcp/cli-mcp-server',
  runtimes: { main: () => import('./cli-mcp-server.main.runtime') },
});
