import { GraphQLContext } from '../index';
import { ProjectService } from '../../modules/projects/projects.service';
import { ApiError } from '../../utils/api-error';

const projectService = new ProjectService();

export const projectResolvers = {
  Query: {
    projects: async (_: unknown, args: { page?: number; limit?: number }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return projectService.getProjects(ctx.user.orgId, args.page, args.limit);
    },
    project: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return projectService.getProject(args.id, ctx.user.orgId);
    },
  },
  Mutation: {
    createProject: async (_: unknown, args: { input: any }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return projectService.createProject(ctx.user.orgId, ctx.user.userId, args.input);
    },
    updateProject: async (_: unknown, args: { id: string; input: any }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return projectService.updateProject(args.id, ctx.user.orgId, args.input);
    },
    deleteProject: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw new ApiError(401, 'Not authenticated');
      return projectService.deleteProject(args.id, ctx.user.orgId);
    },
  },
};
