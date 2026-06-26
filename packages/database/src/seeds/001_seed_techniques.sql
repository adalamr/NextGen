-- Seed: Test Design Technique Library (Layer 2)
INSERT INTO technique_library (name, category, description, when_to_use) VALUES
('Equivalence Partitioning', 'functional', 'Divides input data into equivalent partitions', 'When input ranges can be grouped into valid/invalid classes'),
('Boundary Value Analysis', 'boundary', 'Tests at the edges of input ranges', 'When bugs cluster at boundaries of valid ranges'),
('Decision Tables', 'functional', 'Tests combinations of conditions and actions', 'When multiple conditions determine outputs'),
('State Transition', 'state', 'Tests system behavior across different states', 'When system has distinct states and transitions'),
('Pairwise / Combinatorial', 'combinatorial', 'Tests pairs of parameter combinations', 'When many parameters make full coverage impractical'),
('Use Case Testing', 'functional', 'Tests based on user interaction scenarios', 'When testing end-to-end user workflows'),
('Error Guessing', 'exploratory', 'Tests likely error-prone areas based on experience', 'When testers have domain knowledge of failure patterns')
ON CONFLICT (name) DO NOTHING;
