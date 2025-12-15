import { ApolloClient, InMemoryCache, HttpLink, NormalizedCacheObject } from '@apollo/client';

let apolloClient: ApolloClient<NormalizedCacheObject> | undefined;

function createApolloClient() {
  return new ApolloClient({
    ssrMode: typeof window === 'undefined',
    link: new HttpLink({
      uri: typeof window === 'undefined' ? `http://localhost:${process.env.PORT || 3000}/graphql` : '/graphql',
      credentials: 'include',
    }),
    cache: new InMemoryCache(),
    defaultOptions: { watchQuery: { fetchPolicy: 'cache-and-network' } },
  });
}

export function initializeApollo(initialState: NormalizedCacheObject | null = null) {
  const client = apolloClient ?? createApolloClient();
  if (initialState) {
    client.cache.restore({ ...client.extract(), ...initialState });
  }
  if (typeof window === 'undefined') return client;
  if (!apolloClient) apolloClient = client;
  return client;
}
