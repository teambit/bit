import { useMemo } from 'react';
import { TreeNode } from '@teambit/design.ui.tree';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { inflateToTree } from '@teambit/base-ui.graph.tree.inflate-paths';
import { ComponentCompareAspectsModel } from './compare-aspects-context';

export type ComponentAspectData = {
  icon?: string;
  name?: string;
  config: any;
  data: any;
  aspectId: string;
};

const GET_COMPONENT_ASPECT_DATA = gql`
  query GetComponentAspectData($id: String!, $extensionId: String!) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        id {
          name
          version
          scope
        }
        aspects {
          aspectId: id
          config
          data
          icon
        }
      }
    }
  }
`;

export function useCompareAspectsQuery(host: string): ComponentCompareAspectsModel {
  const componentCompareContext = useComponentCompare();
  const base = componentCompareContext?.base?.model;
  const compare = componentCompareContext?.compare?.model;

  const isCompareVersionWorkspace = componentCompareContext?.compare?.hasLocalChanges;

  const baseId = base?.id.toString();
  const compareId = isCompareVersionWorkspace ? compare?.id.fullName : compare?.id.toString();

  const { data: baseAspectData, loading: baseLoading } = useDataQuery(GET_COMPONENT_ASPECT_DATA, {
    variables: { id: baseId, extensionId: host },
    skip: !base?.id,
  });

  const { data: compareAspectData, loading: compareLoading } = useDataQuery(GET_COMPONENT_ASPECT_DATA, {
    variables: { id: compareId, extensionId: host },
    skip: !compare?.id,
  });

  const loading = baseLoading || compareLoading || componentCompareContext?.loading;
  const baseAspectList: ComponentAspectData[] = baseAspectData?.getHost?.get?.aspects || [];
  const compareAspectList: ComponentAspectData[] = compareAspectData?.getHost?.get?.aspects || [];

  const selectedAspect = useCompareQueryParam('aspect');

  const aspectNames = baseAspectList.concat(compareAspectList).map((aspect) => aspect.aspectId);
  // make sure that Windows paths are converted to posix
  const sortedAspectNames = inflateToTree(
    aspectNames.map((aspectName) => aspectName.replace(/\\/g, '/')),
    (a) => a
  );

  const selected = selectedAspect || firstChild(sortedAspectNames).id;

  const selectedBase = useMemo(
    () => baseAspectList?.find((baseAspect) => baseAspect.aspectId === selected),
    [baseAspectList, selected]
  );

  const selectedCompare = useMemo(
    () => compareAspectList?.find((compareAspect) => compareAspect.aspectId === selected),
    [compareAspectList, selected]
  );

  return {
    loading,
    aspectNames,
    selectedBase,
    selectedCompare,
    base: baseAspectList,
    compare: compareAspectList,
    selected,
    hook: componentCompareContext?.hooks?.aspects,
    state: componentCompareContext?.state?.aspects,
  };
}

function firstChild(node: TreeNode<any>): TreeNode<any> {
  if (node.children && node.children.length > 0) return firstChild(node.children[0]);
  return node;
}
