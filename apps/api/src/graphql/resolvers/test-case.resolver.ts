import { GraphQLContext } from '../index';
import { TestCaseGeneratorService } from '../../modules/layer3-generation/test-case-generator/test-case-generator.service';
import { ApiError } from '../../utils/api-error';

const testCaseService = new TestCaseGeneratorService();

export const testCaseResolvers = {
  Query: {
    testCases: async (_: unknown, args: any, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return testCaseService.getTestCases(args.projectId, args);
    },
    testCase: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return testCaseService.getTestCase(args.id);
    },
  },
  Mutation: {
    generateTestCases: async (_: unknown, args: { input: any }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return testCaseService.generateTestCases(args.input, ctx.user.userId);
    },
    approveTestCase: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return testCaseService.updateStatus(args.id, 'APPROVED', ctx.user.userId);
    },
    rejectTestCase: async (_: unknown, args: { id: string; reason: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return testCaseService.updateStatus(args.id, 'REJECTED', ctx.user.userId, args.reason);
    },
  },
};
