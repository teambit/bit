import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui.hooks.use-data-query';
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
  const { data, ...rest } = useDataQuery<FileResult>(getFile, {
    variables: { id, path: filePath },
    skip: filePath === undefined,
  });

  const fileContent = data?.getHost?.get.getFile;

  return { fileContent, ...rest };
}
