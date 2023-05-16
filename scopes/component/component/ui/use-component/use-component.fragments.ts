import { gql } from '@apollo/client';

export const componentIdFields = gql`
  fragment componentIdFields on ComponentID {
    name
    version
    scope
  }
`;

export const componentOverviewFields = gql`
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
    elementsUrl
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
    }
    compositions {
      identifier
      displayName
    }
  }
  ${componentIdFields}
`;
console.log('🚀 ~ file: use-component.fragments.ts:58 ~ componentOverviewFields:', componentOverviewFields);

export const componentFields = gql`
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
  ${componentOverviewFields}
`;

export const componentFieldsWithLogs = gql`
  fragment componentFieldWithLogs on Component {
    ...componentFields
    logs(
      type: $logType
      offset: $logOffset
      limit: $logLimit
      sort: $logSort
      takeHeadFromComponent: $takeHeadFromComponent
      head: $logHead
      startFrom: $logStartFrom
      until: $logUntil
    ) @skip(if: $fetchLogsByTypeSeparately) {
      id
      message
      username
      email
      date
      hash
      tag
    }
    tagLogs: logs(
      type: "tag"
      offset: $tagLogOffset
      limit: $tagLogLimit
      sort: $tagLogSort
      takeHeadFromComponent: $tagTakeHeadFromComponent
      head: $tagLogHead
      startFrom: $tagStartFrom
      until: $tagUntil
    ) @include(if: $fetchLogsByTypeSeparately) {
      id
      message
      username
      email
      date
      hash
      tag
    }
    snapLogs: logs(
      type: "snap"
      offset: $snapLogOffset
      limit: $snapLogLimit
      sort: $snapLogSort
      takeHeadFromComponent: $snapTakeHeadFromComponent
      head: $snapLogHead
      startFrom: $snapStartFrom
      until: $snapUntil
    ) @include(if: $fetchLogsByTypeSeparately) {
      id
      message
      username
      email
      date
      hash
      tag
    }
  }
  ${componentFields}
`;

export const COMPONENT_QUERY_LOG_FIELDS = `
    $logOffset: Int
    $logLimit: Int
    $logType: String
    $logHead: String
    $logSort: String
    $logStartFrom: String
    $logUntil: String
    $tagLogOffset: Int
    $tagLogLimit: Int
    $tagLogHead: String
    $tagLogSort: String
    $tagStartFrom: String
    $tagUntil: String
    $snapLogOffset: Int
    $snapLogLimit: Int
    $snapLogHead: String
    $snapLogSort: String
    $snapStartFrom: String
    $snapUntil: String
    $takeHeadFromComponent: Boolean
    $tagTakeHeadFromComponent: Boolean
    $snapTakeHeadFromComponent: Boolean
    $fetchLogsByTypeSeparately: Boolean!
`;

export const GET_COMPONENT = gql`
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

export const GET_COMPONENT_WITH_LOGS = gql`
  query Component($extensionId: String!, $id: String!) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        ...componentFieldWithLogs
      }
    }
  }
  ${componentFieldsWithLogs}
`;

export const SUB_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded {
    componentAdded {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

export const SUB_COMPONENT_CHANGED = gql`
  subscription OnComponentChanged {
    componentChanged {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

export const SUB_COMPONENT_REMOVED = gql`
  subscription OnComponentRemoved {
    componentRemoved {
      componentIds {
        ...componentIdFields
      }
    }
  }
  ${componentIdFields}
`;
