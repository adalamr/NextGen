export const authTypeDefs = `#graphql
  type AuthUser {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    role: String!
  }

  type AuthPayload {
    user: AuthUser!
    accessToken: String!
    refreshToken: String!
  }

  extend type Query {
    me: AuthUser
  }
`;
