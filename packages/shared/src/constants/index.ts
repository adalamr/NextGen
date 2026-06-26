export const SUPPORTED_FRAMEWORKS = ['PLAYWRIGHT', 'CYPRESS', 'SELENIUM', 'REST_ASSURED', 'K6'] as const;

export const TEST_TECHNIQUES = [
  'Equivalence Partitioning',
  'Boundary Value Analysis',
  'Decision Tables',
  'State Transition',
  'Pairwise / Combinatorial',
  'Use Case Testing',
  'Error Guessing',
] as const;

export const MAX_FILE_SIZE_MB = 50;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
