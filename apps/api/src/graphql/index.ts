import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { Express } from 'express';
import { Server } from 'http';
import { typeDefs } from './schemas';
import { resolvers } from './resolvers';
import { logger } from '../utils/logger';
import { JwtPayload } from '../middleware/auth.middleware';
import jwt from 'jsonwebtoken';
import { config } from '../config/app.config';

export interface GraphQLContext {
  user?: JwtPayload;
}

export async function setupApolloServer(app: Express, _httpServer: Server): Promise<void> {
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const server = new ApolloServer<GraphQLContext>({
    schema,
    introspection: config.nodeEnv !== 'production',
    formatError: (formattedError) => {
      logger.error('GraphQL Error:', formattedError);
      return formattedError;
    },
  });

  await server.start();

  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          try {
            const token = authHeader.split(' ')[1];
            const user = jwt.verify(token, config.jwt.secret) as JwtPayload;
            return { user };
          } catch {
            return {};
          }
        }
        return {};
      },
    }),
  );

  logger.info('✅ Apollo GraphQL server started');
}
