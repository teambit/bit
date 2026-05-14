import { gql, useSubscription } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import type { ComponentID } from '@teambit/component-id';

const getFile = gql`
  query getFile($id: String!, $extensionId: String, $path: String) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        id {
          # used for GQL caching
          name
          version
          scope
        }
        getFile(path: $path)
      }
    }
  }
`;

const COMPONENT_CHANGED_SUBSCRIPTION = gql`
  subscription OnComponentChangedForFile {
    componentChanged {
      component {
        id {
          name
          scope
        }
      }
    }
  }
`;

type FileResult = {
  getHost: {
    id: string;
    get: {
      id: {
        name: string;
        version: string;
        scope: string;
      };
      getFile?: string;
    };
  };
};

type ComponentChangedSubData = {
  componentChanged?: {
    component?: {
      id: { name: string; scope: string };
    };
  };
};

export function useFileContent(componentId?: ComponentID, filePath?: string, skip?: boolean, host?: string) {
  const id = componentId?.toString();
  const querySkip = skip || !componentId || filePath === undefined;

  const { data, loading, refetch } = useDataQuery<FileResult>(getFile, {
    variables: { id, path: filePath, extensionId: host },
    skip: querySkip,
  });

  useSubscription<ComponentChangedSubData>(COMPONENT_CHANGED_SUBSCRIPTION, {
    skip: querySkip,
    onSubscriptionData: ({ subscriptionData }) => {
      const changedId = subscriptionData.data?.componentChanged?.component?.id;
      if (!changedId || !componentId) return;
      if (changedId.name !== componentId.fullName) return;
      if (changedId.scope && componentId.scope && changedId.scope !== componentId.scope) return;
      refetch();
    },
  });

  const fileContent = data?.getHost?.get?.getFile;

  return { fileContent, loading };
}
