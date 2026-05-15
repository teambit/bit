import { Aspect } from '../../harmony/harmony/aspect';

export const CliMcpServerAspect = Aspect.create({
  id: 'teambit.mcp/cli-mcp-server',
  runtimes: { main: () => import('./cli-mcp-server.main.runtime') },
});
