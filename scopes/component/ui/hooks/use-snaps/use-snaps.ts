import { useDataQuery } from '@teambit/ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { ComponentID } from '@teambit/component';
import { LegacyComponentLog } from '@teambit/legacy-component-log';

const getComponentSnaps = gql`
  query getComponentSnaps($id: String!) {
    getHost {
      id # used for GQL caching
      logs(id: $id) {
        message
        username
        email
        date
        hash
        tag
      }
    }
  }
`;

export type SnapsResults = {
  getHost: {
    id: string;
    logs: LegacyComponentLog[];
  };
};

export function useSnaps(componentId: ComponentID) {
  const id = componentId.toString();
  const { data, ...rest } = useDataQuery<SnapsResults>(getComponentSnaps, {
    variables: { id },
  });

  const snaps = data?.getHost?.logs;
  return { snaps, ...rest };
}
