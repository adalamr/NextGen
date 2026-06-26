import { mergeResolvers } from '@graphql-tools/merge';
import { baseResolvers } from './base.resolver';
import { authResolvers } from './auth.resolver';
import { projectResolvers } from './project.resolver';
import { testCaseResolvers } from './test-case.resolver';
import { traceabilityResolvers } from './traceability.resolver';

export const resolvers = mergeResolvers([
  baseResolvers,
  authResolvers,
  projectResolvers,
  testCaseResolvers,
  traceabilityResolvers,
]);
