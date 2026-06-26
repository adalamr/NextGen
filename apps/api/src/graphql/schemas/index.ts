import { mergeTypeDefs } from '@graphql-tools/merge';
import { baseTypeDefs } from './base.schema';
import { authTypeDefs } from './auth.schema';
import { projectTypeDefs } from './project.schema';
import { testCaseTypeDefs } from './test-case.schema';
import { traceabilityTypeDefs } from './traceability.schema';

export const typeDefs = mergeTypeDefs([
  baseTypeDefs,
  authTypeDefs,
  projectTypeDefs,
  testCaseTypeDefs,
  traceabilityTypeDefs,
]);
