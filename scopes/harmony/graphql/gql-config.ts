export type GqlConfig = {
  /** gql pathname
   * @default '/graphql'
   */
  endpoint: string;
  /** graphql pathname during SSR
   * @default '/graphql
   */
  ssrEndpoint?: string;
  /** gql pathname for subscriptions
   * @default '/subscriptions'
   */
  subscriptionEndpoint?: string;
};
