export const traceabilityTypeDefs = `#graphql
  type TraceLink {
    id: ID!
    sourceType: TraceNodeType!
    sourceId: String!
    targetType: TraceNodeType!
    targetId: String!
    relationship: String!
    createdAt: DateTime!
  }

  type TraceabilityMatrix {
    projectId: ID!
    requirements: [TraceRequirement!]!
    coverage: TraceCoverage!
  }

  type TraceRequirement {
    id: ID!
    title: String!
    testCases: [TestCase!]!
    coveredByTests: Int!
    status: CoverageStatus!
  }

  type TraceCoverage {
    totalRequirements: Int!
    coveredRequirements: Int!
    coveragePercentage: Float!
    gaps: [String!]!
  }

  enum TraceNodeType {
    REQUIREMENT
    TEST_CASE
    CODE_PATH
    DEFECT
    SCRIPT
  }

  enum CoverageStatus {
    COVERED
    PARTIAL
    NOT_COVERED
  }

  extend type Query {
    traceabilityMatrix(projectId: ID!): TraceabilityMatrix!
    traceLinks(sourceType: TraceNodeType, sourceId: ID): [TraceLink!]!
  }
`;
