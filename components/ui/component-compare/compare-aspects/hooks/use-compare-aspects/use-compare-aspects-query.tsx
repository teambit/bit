import { useMemo } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import {
  ComponentCompareAspectsModel,
  ComponentAspectData,
} from '@teambit/component.ui.component-compare.compare-aspects.models.component-compare-aspects-model';
import { gql } from '@apollo/client';

export const GET_COMPONENT_ASPECT_DATA = gql`
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

  const baseId = `${base?.id.fullName}@${base?.id.version}`;
  const compareId = isCompareVersionWorkspace ? compare?.id.fullName : `${compare?.id.fullName}@${compare?.id.version}`;

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

  const selected = selectedAspect || (compareAspectList?.length > 0 && compareAspectList[0].aspectId) || undefined;

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
    selectedBase,
    selectedCompare,
    base: baseAspectList,
    compare: compareAspectList,
    selected,
  };
}
