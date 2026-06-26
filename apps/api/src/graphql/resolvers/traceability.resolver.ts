import { GraphQLContext } from '../index';
import { TraceabilityService } from '../../modules/layer1-context/traceability/traceability.service';
import { ApiError } from '../../utils/api-error';

const traceabilityService = new TraceabilityService();

export const traceabilityResolvers = {
  Query: {
    traceabilityMatrix: async (_: unknown, args: { projectId: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return traceabilityService.getMatrix(args.projectId);
    },
    traceLinks: async (_: unknown, args: any, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      // getLinks does not exist — delegate to getMatrix and extract links from the row
      const matrix = await traceabilityService.getMatrix(args.projectId);
      const row = matrix.requirements.find(
        (r) => r.id === args.sourceId || r.externalId === args.sourceId,
      );
      return row?.testCases ?? [];
    },
  },
};
