import { useDataQuery } from '@teambit/ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { ComponentID } from '@teambit/component';
import type { ComponentLog } from 'bit-bin/dist/scope/models/model-component';

const getChangeLogSnaps = gql`
  query getChangeLogSnaps($id: String!) {
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

type SnapsResults = {
  getHost: {
    id: string;
    logs: ComponentLog;
  };
};

export function useSnaps(componentId: ComponentID) {
  const id = componentId.toString();
  const { data, ...rest } = useDataQuery<SnapsResults>(getChangeLogSnaps, {
    variables: { id },
  });

  const snaps = data?.getHost.logs;
  return { snaps, ...rest };
}
