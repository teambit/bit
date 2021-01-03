import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { ComponentID } from '@teambit/component';

const getDocs = gql`
  query($id: String!) {
    getHost {
      get(id: $id) {
        fs
        mainFile
        devFiles
        dependencies {
          id
          version
          lifecycle
          packageName
        }
      }
    }
  }
`;

const getFile = gql`
  query($id: String!, $path: String) {
    getHost {
      get(id: $id) {
        getFile(path: $path)
      }
    }
  }
`;

type Dependency = {
  id: string;
  lifecycle: string;
  packageName: string | null;
  version: string;
  __typename: string;
};

type DocsResults = {
  getHost: {
    get: {
      fs?: string[];
      mainFile?: string;
      dependencies: Dependency[];
      devFiles: string[];
    };
  };
};
type FileResult = {
  getHost: {
    get: {
      getFile?: string;
    };
  };
};

export function useCode(componentId: ComponentID) {
  const id = componentId._legacy.name;
  const { data } = useQuery<DocsResults>(getDocs, {
    variables: { id },
  });

  const fileTree = data?.getHost?.get.fs;
  const mainFile = data?.getHost?.get.mainFile;
  const devFiles = data?.getHost?.get.devFiles;
  const dependencies = buildDependencyTree(data?.getHost?.get.dependencies);

  return { fileTree, mainFile, dependencies, devFiles };
}

export function useFileContent(componentId: ComponentID, filePath: string) {
  const id = componentId._legacy.name;
  const { data } = useQuery<FileResult>(getFile, {
    variables: { id, path: filePath },
  });

  const fileContent = data?.getHost?.get.getFile;

  return fileContent;
}

function buildDependencyTree(deps?: Dependency[]) {
  const devDependencies: Dependency[] = [];
  const dependencies: Dependency[] = [];
  if (!deps) return [];
  deps.map((dep) => {
    if (dep.lifecycle === 'dev') {
      devDependencies.push(dep);
      return;
    }
    dependencies.push(dep);
    return;
  });
  return {
    dependencies: dependencies,
    devDependencies: devDependencies,
  };
}
