export const projectTypeDefs = `#graphql
  type Project {
    id: ID!
    name: String!
    description: String
    slug: String!
    orgId: String!
    status: ProjectStatus!
    llmConfig: LLMConfig
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type LLMConfig {
    apiEndpoint: String!
    modelName: String!
    # apiKey is never returned to client
  }

  enum ProjectStatus {
    ACTIVE
    ARCHIVED
    DRAFT
  }

  input CreateProjectInput {
    name: String!
    description: String
    llmApiEndpoint: String
    llmApiKey: String
    llmModelName: String
  }

  input UpdateProjectInput {
    name: String
    description: String
    llmApiEndpoint: String
    llmApiKey: String
    llmModelName: String
    status: ProjectStatus
  }

  extend type Query {
    projects(page: Int, limit: Int): [Project!]!
    project(id: ID!): Project
  }

  extend type Mutation {
    createProject(input: CreateProjectInput!): Project!
    updateProject(id: ID!, input: UpdateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!
  }
`;
