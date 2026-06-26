export const testCaseTypeDefs = `#graphql
  type TestCase {
    id: ID!
    projectId: String!
    title: String!
    description: String
    preconditions: [String!]!
    steps: [TestStep!]!
    expectedResults: [String!]!
    postconditions: [String!]!
    status: TestCaseStatus!
    priority: Priority!
    technique: String
    riskScore: Float
    tags: [String!]!
    traceabilityLinks: [TraceLink!]!
    generatedScript: GeneratedScript
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type TestStep {
    order: Int!
    action: String!
    expectedOutcome: String
  }

  type GeneratedScript {
    id: ID!
    framework: ScriptFramework!
    language: String!
    content: String!
    filePath: String
    status: ScriptStatus!
  }

  enum TestCaseStatus {
    DRAFT
    PENDING_REVIEW
    APPROVED
    REJECTED
    ACTIVE
    DEPRECATED
  }

  enum Priority {
    CRITICAL
    HIGH
    MEDIUM
    LOW
  }

  enum ScriptFramework {
    PLAYWRIGHT
    CYPRESS
    SELENIUM
    REST_ASSURED
    K6
  }

  enum ScriptStatus {
    GENERATED
    VALIDATED
    EXECUTED
    FAILED
  }

  input GenerateTestCasesInput {
    projectId: ID!
    requirementId: ID
    requirementText: String
    technique: String
    count: Int
  }

  extend type Query {
    testCases(projectId: ID!, page: Int, limit: Int, status: TestCaseStatus): [TestCase!]!
    testCase(id: ID!): TestCase
  }

  extend type Mutation {
    generateTestCases(input: GenerateTestCasesInput!): [TestCase!]!
    approveTestCase(id: ID!): TestCase!
    rejectTestCase(id: ID!, reason: String!): TestCase!
    generateScript(testCaseId: ID!, framework: ScriptFramework!): GeneratedScript!
  }

  extend type Subscription {
    testCaseGenerated(projectId: ID!): TestCase!
    scriptGenerated(testCaseId: ID!): GeneratedScript!
  }
`;
