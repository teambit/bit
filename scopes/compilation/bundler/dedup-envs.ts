import { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { ExecutionContext } from '@teambit/envs';

type GroupIdContextMap = Record<string, ExecutionContext[]>;

/**
 * de-duping dev servers by the amount of type the dev server configuration was overridden by envs.
 * This will split the dev server to groups of dev server that share the same webpack config, and same peer dependencies
 * @param contexts
 * @param dependencyResolver
 * @param dedicatedEnvDevServers
 */
export async function dedupEnvs(
  contexts: ExecutionContext[],
  dependencyResolver: DependencyResolverMain,
  dedicatedEnvDevServers?: string[]
) {
  const idsGroups = groupByEnvId(contexts, dedicatedEnvDevServers);
  const hasRootComponents = dependencyResolver.hasRootComponents();
  // Do not split envs by peers if root components is enabled as it should be already handled by the package manager
  // this will improve the performance of the dev server when root components is enabled
  const finalGroups = hasRootComponents ? idsGroups : await splitByPeers(idsGroups, dependencyResolver);
  return finalGroups;
}

function groupByEnvId(contexts: ExecutionContext[], dedicatedEnvDevServers?: string[]) {
  const groupedEnvs: GroupIdContextMap = {};

  contexts.forEach((context) => {
    const envId = getEnvId(context, dedicatedEnvDevServers);
    if (!envId) return;
    if (!(envId in groupedEnvs)) groupedEnvs[envId] = [];

    groupedEnvs[envId].push(context);
  });

  return groupedEnvs;
}

async function splitByPeers(idsGroups: GroupIdContextMap, dependencyResolver: DependencyResolverMain) {
  const newGroupedEnvs: GroupIdContextMap = {};
  const promises = Object.values(idsGroups).map(async (contexts) => {
    const peersGroups = await groupByPeersHash(contexts, dependencyResolver);
    Object.assign(newGroupedEnvs, peersGroups);
  });
  await Promise.all(promises);
  return newGroupedEnvs;
}

function getEnvId(context: ExecutionContext, dedicatedServers?: string[]): string | undefined {
  const id = context.id.split('@')[0];

  if (dedicatedServers?.includes(id)) {
    return context.id;
  }

  return context.env?.getDevEnvId(context);
}

async function groupByPeersHash(contexts: ExecutionContext[], dependencyResolver: DependencyResolverMain) {
  const peerGroups: GroupIdContextMap = {};

  await Promise.all(
    contexts.map(async (context) => {
      const env = context.env;
      const policy = await dependencyResolver.getComponentEnvPolicyFromEnv(env);
      const peersHash = policy.byLifecycleType('peer').hashNameVersion();
      if (!peerGroups[peersHash]) {
        peerGroups[peersHash] = [];
      }
      peerGroups[peersHash].push(context);
    })
  );
  return indexPeerGroupsById(peerGroups);
}

function indexPeerGroupsById(peerGroups: GroupIdContextMap) {
  const result: GroupIdContextMap = Object.values(peerGroups).reduce((acc, contexts) => {
    const firstId = contexts[0].id;
    acc[firstId] = contexts;
    return acc;
  }, {});
  return result;
}
