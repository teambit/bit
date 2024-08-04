import { gql } from 'graphql-tag';
import { DocumentNode } from '@apollo/client';

export const componentIdFields: DocumentNode = gql`
  fragment componentIdFields on ComponentID {
    name
    version
    scope
  }
`;

export const componentOverviewFields: DocumentNode = gql`
  fragment componentOverviewFields on Component {
    id {
      ...componentIdFields
    }
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs"]) {
      # 'id' property in gql refers to a *global* identifier and used for caching.
      # this makes aspect data cache under the same key, even when they are under different components.
      # renaming the property fixes that.
      id
      data
    }
    description
    deprecation {
      isDeprecate
      newId
    }
    labels
    displayName
    server {
      env
      url
      host
      basePath
    }
    buildStatus
    env {
      id
      icon
    }
    size {
      compressedTotal
    }
    preview {
      includesEnvTemplate
      legacyHeader
      isScaling
      skipIncludes
      onlyOverview
      useNameParam
    }
    compositions {
      identifier
      displayName
      filepath
    }
  }
  ${componentIdFields}
`;

export const componentFields: DocumentNode = gql`
  fragment componentFields on Component {
    ...componentOverviewFields
    packageName
    latest
    compositions {
      identifier
      displayName
    }
    tags {
      version
    }
  }
  ${componentOverviewFields}
`;

export const componentFieldsWithLogs: DocumentNode = gql`
  fragment componentFieldWithLogs on Component {
    id {
      ...componentIdFields
    }
    packageName
    latest
    logs(
      type: $logType
      offset: $logOffset
      limit: $logLimit
      sort: $logSort
      head: $logHead
      takeHeadFromComponent: $logTakeHeadFromComponent
    ) {
      id
      message
      username
      email
      date
      hash
      tag
      displayName
    }
  }
  ${componentIdFields}
`;

export const COMPONENT_QUERY_LOG_FIELDS = `
  $logOffset: Int
  $logLimit: Int
  $logType: String
  $logHead: String
  $logSort: String
  $logTakeHeadFromComponent: Boolean
`;

export const GET_COMPONENT: DocumentNode = gql`
  query Component($extensionId: String!, $id: String!) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

export const GET_COMPONENT_WITH_LOGS: DocumentNode = gql`
  query Component(
    $extensionId: String!
    $id: String!
    ${COMPONENT_QUERY_LOG_FIELDS}
    ) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        ...componentFieldWithLogs
      }
    }
  }
  ${componentFieldsWithLogs}
`;

export const SUB_SUBSCRIPTION_ADDED: DocumentNode = gql`
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

export const SUB_COMPONENT_CHANGED: DocumentNode = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

export const SUB_COMPONENT_REMOVED: DocumentNode = gql`
  subscription OnComponentRemoved {
    componentRemoved {
      componentIds {
        ...componentIdFields
      }
    }
  }
  ${componentIdFields}
`;
