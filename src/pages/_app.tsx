import type { AppProps } from 'next/app';
import { ApolloProvider, NormalizedCacheObject } from '@apollo/client';
import { useApollo } from '@/lib/apollo';
import '@/styles/globals.css';

interface PageProps {
  initialApolloState?: NormalizedCacheObject;
}

export default function App({ Component, pageProps }: AppProps<PageProps>) {
  const apolloClient = useApollo(pageProps.initialApolloState ?? null);

  return (
    <ApolloProvider client={apolloClient}>
      <Component {...pageProps} />
    </ApolloProvider>
  );
}

