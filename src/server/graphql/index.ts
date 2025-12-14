import { ApolloServer } from '@apollo/server';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import type { GraphQLContext } from './context';

export function createApolloServer() {
  return new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== 'production',
  });
}
