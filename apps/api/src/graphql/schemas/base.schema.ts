export const baseTypeDefs = `#graphql
  scalar DateTime
  scalar JSON
  scalar Upload

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    totalCount: Int!
    page: Int!
    limit: Int!
  }

  type Query {
    _health: String
  }

  type Mutation {
    _placeholder: Boolean
  }

  type Subscription {
    _placeholder: Boolean
  }
`;
