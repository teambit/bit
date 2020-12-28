import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { ComponentID } from '@teambit/component';

const getDocs = gql`
  query($id: String!, $path: String) {
    getHost {
      get(id: $id) {
        fs
        mainFile
        getFile(path: $path)
      }
    }
  }
`;

type DocsResults = {
  getHost: {
    get: {
      fs?: string[];
      mainFile?: string;
      getFile?: string;
    };
  };
};

export function useCode(componentId: ComponentID, filePath: string) {
  const id = componentId._legacy.name;
  const { data } = useQuery<DocsResults>(getDocs, {
    variables: { id, path: filePath.split('#')[1] }, // TODO - make this better
  });

  const fileTree = data?.getHost?.get.fs;
  const mainFile = data?.getHost?.get.mainFile;
  const getFile = data?.getHost?.get.getFile;

  return { fileTree, mainFile, getFile };
}
