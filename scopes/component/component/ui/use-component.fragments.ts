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
    # dependency-resolver is required by InlineDepsCompare — reads
    # descriptor.get('teambit.dependencies/dependency-resolver').dependencies to compute the diff.
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs", "teambit.dependencies/dependency-resolver"]) {
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
      id
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
  }
  ${componentOverviewFields}
`;

export const componentFieldsWithLogs = gql`
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

/**
 * Combined fields-and-logs query. The lane-compare UI previously fired
 *   - GET_COMPONENT (componentFields)
 *   - GET_COMPONENT_WITH_LOGS (componentFieldWithLogs)
 * as two separate ops per component, doubling the batched-fanout count (10 components → 20 ops →
 * 20 host.get loads). Merging them into one op halves that fanout. The logs args are still optional
 * variables — pass-through to the same logs resolver as the standalone query.
 */
export const GET_COMPONENT_WITH_FIELDS_AND_LOGS = gql`
  query Component(
    $extensionId: String!
    $id: String!
    ${COMPONENT_QUERY_LOG_FIELDS}
  ) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        ...componentFields
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
    }
  }
  ${componentFields}
`;

export const GET_COMPONENT_WITH_LOGS = gql`
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

/**
 * Bulk variant of GET_COMPONENT_WITH_FIELDS_AND_LOGS — fetches N components in a single op via the
 * `ComponentHost.getMany` resolver. For consumers that already know the full list of ids up front
 * (the lane-compare panel, the cloud changes view, etc.), this replaces N concurrent batched ops
 * with one — collapsing all the per-op graphql parse/validate/dispatch overhead.
 *
 * Items in the response are aligned to input `ids` order; a failed lookup becomes a `null` slot
 * rather than failing the whole call.
 */
export const GET_COMPONENTS_BULK = gql`
  query ComponentsBulk(
    $extensionId: String!
    $ids: [String!]!
    ${COMPONENT_QUERY_LOG_FIELDS}
  ) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      getMany(ids: $ids) {
        ...componentFields
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
    }
  }
  ${componentFields}
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
