import { useDataQuery } from '@teambit/ui';
import { gql } from 'apollo-boost';
import { ComponentID } from '@teambit/component';

const getFile = gql`
  query($id: String!, $path: String) {
    getHost {
      get(id: $id) {
        getFile(path: $path)
      }
    }
  }
`;

type FileResult = {
  getHost: {
    get: {
      getFile?: string;
    };
  };
};

export function useFileContent(componentId: ComponentID, filePath?: string) {
  const id = componentId._legacy.name;
  const { data } = useDataQuery<FileResult>(getFile, {
    variables: { id, path: filePath },
  });

  const fileContent = data?.getHost?.get.getFile;

  return fileContent;
}
