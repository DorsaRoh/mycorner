import type { AppProps } from 'next/app';
import { ApolloProvider, NormalizedCacheObject } from '@apollo/client';
import { initializeApollo } from '@/lib/apollo/client';
import { PageCurl } from '@/components/common/PageCurl';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps<{ initialApolloState?: NormalizedCacheObject }>) {
  const apolloClient = initializeApollo(pageProps.initialApolloState ?? null);
  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
      <PageCurl />
    </ApolloProvider>
  );
}
