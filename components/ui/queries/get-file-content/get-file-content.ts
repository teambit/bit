import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentID } from '@teambit/component';

const getFile = gql`
  query getFile($id: String!, $extensionId: String!, $path: String) {
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

export function useFileContent(
  componentId?: ComponentID, 
  filePath?: string, 
  skip?: boolean, 
  host?: string,
) {
  const id =  componentId?.toString();

  const { data, ...rest } = useDataQuery<FileResult>(getFile, {
    variables: { id, path: filePath, extensionId: host  },
    skip: skip || !componentId || filePath === undefined,
  });

  const fileContent = data?.getHost?.get?.getFile;

  return { fileContent, ...rest };
}
