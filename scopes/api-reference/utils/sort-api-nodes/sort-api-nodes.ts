import { APINode } from '@teambit/api-reference.models.api-reference-model';

export function sortAPINodes(apiNodeA: APINode, apiNodeB: APINode): 1 | -1 | 0 {
  const aNodeType = apiNodeA.renderer.nodeType;
  const bNodeType = apiNodeB.renderer.nodeType;

  if (aNodeType < bNodeType) return -1;
  if (aNodeType > bNodeType) return 1;

  const aNodeName = apiNodeA.renderer.getName(apiNodeA.api);
  const bNodeName = apiNodeB.renderer.getName(apiNodeB.api);

  if (aNodeName < bNodeName) return -1;
  if (aNodeName > bNodeName) return 1;
  return 0;
}
