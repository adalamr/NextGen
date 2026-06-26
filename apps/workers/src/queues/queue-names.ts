export const QUEUE_NAMES = {
  // Layer 1
  INGESTION: 'layer1:ingestion',
  EMBEDDING: 'layer1:embedding',

  // Layer 2
  TECHNIQUE_ANALYSIS: 'layer2:technique-analysis',

  // Layer 3
  TEST_CASE_GENERATION: 'layer3:test-case-generation',
  SCRIPT_GENERATION: 'layer3:script-generation',
  TEST_DATA_GENERATION: 'layer3:test-data-generation',

  // Layer 4
  EXECUTION: 'layer4:execution',
  CICD_WEBHOOK: 'layer4:cicd-webhook',

  // Layer 5
  RESULT_CLASSIFICATION: 'layer5:result-classification',
  FAILURE_CLUSTERING: 'layer5:failure-clustering',
  SELF_HEALING: 'layer5:self-healing',

  // Layer 6
  REVIEW_GATE_NOTIFICATION: 'layer6:review-gate-notification',
} as const;
