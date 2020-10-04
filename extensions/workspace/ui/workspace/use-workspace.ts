import { useSubscription } from '@apollo/react-hooks';
import { useDataQuery } from '@teambit/ui';
import gql from 'graphql-tag';

import { Workspace } from './workspace-model';

const componentFields = gql`
  fragment componentFields on Component {
    id {
      name
      version
      scope
    }
    issuesCount
    status {
      isNew
      isInScope
      isStaged
      modifyInfo {
        hasModifiedFiles
        hasModifiedDependencies
      }
      isDeleted
    }
    deprecation {
      isDeprecate
    }
    server {
      env
      url
    }
    env {
      id
      icon
    }
  }
`;

const WORKSPACE = gql`
  query workspace {
    workspace {
      name
      path
      icon
      components {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const COMPONENT_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const COMPONENT_SUBSCRIPTION_CHANGED = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

export function useWorkspace() {
  const { data } = useDataQuery(WORKSPACE);
  const onComponentAdded = useSubscription(COMPONENT_SUBSCRIPTION_ADDED);
  const onComponentChanged = useSubscription(COMPONENT_SUBSCRIPTION_CHANGED);
  if (onComponentAdded.data && data) {
    data.workspace.components.push(onComponentAdded.data.componentAdded.component);
  }

  // TODO: write it more pretty
  if (onComponentChanged.data && data) {
    const updatedComponent = onComponentChanged.data.componentChanged.component;
    // replace the component
    data.workspace.components = data.workspace.components.map((component) =>
      component.id.name === updatedComponent.id.name ? updatedComponent : component
    );
  }

  if (data) return Workspace.from(data.workspace);
  return undefined;
}
