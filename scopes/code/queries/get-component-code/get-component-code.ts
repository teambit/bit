import { useDataQuery } from '@teambit/ui';
import { gql } from 'apollo-boost';
import { ComponentID } from '@teambit/component';

const getCode = gql`
  query getCode($id: String!) {
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

// is this the place I should hold the dependency type?
export type DependencyType = {
  id: string;
  lifecycle: string;
  packageName: string | null;
  version: string;
  __typename: string; // TODO - remove this once gilad implements the link to the component/package in the dependency resolver
};

type CodeResults = {
  getHost: {
    get: {
      fs?: string[];
      mainFile?: string;
      dependencies: DependencyType[];
      devFiles: string[];
    };
  };
};

export function useCode(componentId: ComponentID) {
  const id = componentId.toString();
  const { data, ...rest } = useDataQuery<CodeResults>(getCode, {
    variables: { id },
  });

  const fileTree = data?.getHost?.get.fs;
  const mainFile = data?.getHost?.get.mainFile;
  const devFiles = data?.getHost?.get.devFiles;
  const dependencies = data?.getHost?.get.dependencies;

  return { fileTree, mainFile, dependencies, devFiles, ...rest };
}
