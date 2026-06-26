import { GraphQLContext } from '../index';
import { getPool } from '../../config/database.config';
import { ApiError } from '../../utils/api-error';

export const authResolvers = {
  Query: {
    me: async (_: unknown, __: unknown, context: GraphQLContext) => {
      if (!context.user) throw new ApiError(401, 'Not authenticated');

      const pool = getPool();
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, role FROM users WHERE id = $1',
        [context.user.userId],
      );

      if (!result.rows.length) throw new ApiError(404, 'User not found');
      const u = result.rows[0];

      return {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
      };
    },
  },
};
