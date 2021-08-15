import type { ExecutionContext } from '@teambit/envs';

// de-duping dev servers by the amount of type the dev server configuration was overridden by envs.
export function dedupEnvs(contexts: ExecutionContext[], dedicatedEnvDevServers?: string[]) {
  const groupedEnvs: Record<string, ExecutionContext[]> = {};

  contexts.forEach((context) => {
    const envId = getEnvId(context, dedicatedEnvDevServers);
    if (!envId) return;
    if (!(envId in groupedEnvs)) groupedEnvs[envId] = [];

    groupedEnvs[envId].push(context);
  });

  return groupedEnvs;
}

function getEnvId(context: ExecutionContext, dedicatedServers?: string[]): string | undefined {
  const id = context.id.split('@')[0];

  if (dedicatedServers?.includes(id)) {
    return context.id;
  }

  return context.env?.getDevEnvId(context);
}
