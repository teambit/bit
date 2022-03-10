import { request, gql } from 'graphql-request';

const GQL_SERVER = '/graphql';
const GET_COMPONENT_ASPECTS = gql`
  query getComponentAspects($id: String!) {
    getHost {
      id
      get(id: $id) {
        aspects {
          id
        }
      }
    }
  }
`;
type QueryResult = {
  getHost: {
    id: string;
    get: {
      aspects: { id: string }[];
    };
  };
};

export async function fetchComponentAspects(componentId: string) {
  try {
    const response = await request<QueryResult>(GQL_SERVER, GET_COMPONENT_ASPECTS, { id: componentId.toString() });
    return response.getHost.get.aspects.map((x) => x.id);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error(`[gql] error on "getComponentAspects" - "${err.toString()}"`);
    return undefined;
  }
}
