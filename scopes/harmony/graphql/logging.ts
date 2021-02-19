import { ErrorResponse } from '@apollo/client/link/error';

export function logError({ graphQLErrors, networkError, operation }: ErrorResponse) {
  if (graphQLErrors)
    graphQLErrors.forEach(({ message, locations, path }) =>
      // eslint-disable-next-line no-console
      console.error(`[gql] error on "${operation.operationName}" - "${message}"`, locations, path)
    );

  // eslint-disable-next-line no-console
  if (networkError) console.error('[gql] network error', `"${operation.operationName}"`, networkError);
}

// // // a fetch monkey patch with logs. useful to debug gql
// function loggingCrossFetch(...p: Parameters<typeof fetch>) {
//   const [url, init] = p;
//   const headers = init?.headers;
//   const body = init?.body;

//   console.debug('[gql]', 'fetching', url, body, { headers });
//   const promise = crossFetch(...p);
//   promise
//     .then((result) => console.debug('[gql]', 'finished', result))
//     .catch((err) => console.debug('[gql]', 'error', err));
//   return promise;
// }
