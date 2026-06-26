import { Express } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { layer1RequestLogger } from '../middleware/layer1-logger.middleware';

// Auth
import authRouter from '../modules/auth/auth.routes';

// Core
import usersRouter from '../modules/users/users.routes';
import organizationsRouter from '../modules/organizations/organizations.routes';
import projectsRouter from '../modules/projects/projects.routes';

// Layer 1 - Context & Knowledge
import connectorsRouter from '../modules/layer1-context/connectors/connectors.routes';
import appModelRouter from '../modules/layer1-context/app-model/app-model.routes';
import knowledgeBaseRouter from '../modules/layer1-context/knowledge-base/knowledge-base.routes';
import traceabilityRouter from '../modules/layer1-context/traceability/traceability.routes';
import requirementsRouter from '../modules/layer1-context/requirements/requirements.routes';
import feedbackRouter from '../modules/layer1-context/feedback/feedback.routes';
import templatesRouter from '../modules/layer1-context/templates/templates.routes';

// Layer 2 - Test Design
import techniqueEngineRouter from '../modules/layer2-design/technique-engine/technique-engine.routes';
import riskPrioritizationRouter from '../modules/layer2-design/risk-prioritization/risk-prioritization.routes';
import coverageGapRouter from '../modules/layer2-design/coverage-gap/coverage-gap.routes';

// Layer 3 - Generation
import testCaseGeneratorRouter from '../modules/layer3-generation/test-case-generator/test-case-generator.routes';
import scriptGeneratorRouter from '../modules/layer3-generation/script-generator/script-generator.routes';
import testDataGeneratorRouter from '../modules/layer3-generation/test-data-generator/test-data-generator.routes';

// Layer 4 - Execution
import runnerRouter from '../modules/layer4-execution/runner/runner.routes';
import environmentRouter from '../modules/layer4-execution/environment/environment.routes';
import cicdRouter from '../modules/layer4-execution/cicd/cicd.routes';

// Layer 5 - Analysis
import resultClassifierRouter from '../modules/layer5-analysis/result-classifier/result-classifier.routes';
import selfHealingRouter from '../modules/layer5-analysis/self-healing/self-healing.routes';
import coverageAnalyticsRouter from '../modules/layer5-analysis/coverage-analytics/coverage-analytics.routes';

// Layer 6 - Governance
import reviewGatesRouter from '../modules/layer6-governance/review-gates/review-gates.routes';
import versioningRouter from '../modules/layer6-governance/versioning/versioning.routes';
import explainabilityRouter from '../modules/layer6-governance/explainability/explainability.routes';
import rbacRouter from '../modules/layer6-governance/rbac/rbac.routes';

const API_V1 = '/api/v1';

export function setupRestRoutes(app: Express): void {
  // Public routes
  app.use(`${API_V1}/auth`, authRouter);

  // Protected routes (require JWT)
  app.use(`${API_V1}/users`, authenticate, usersRouter);
  app.use(`${API_V1}/organizations`, authenticate, organizationsRouter);
  app.use(`${API_V1}/projects`, authenticate, projectsRouter);

  // Layer 1 — authenticate + structured request logger on every route group
  app.use(`${API_V1}/connectors`,    authenticate, layer1RequestLogger, connectorsRouter);
  app.use(`${API_V1}/app-model`,     authenticate, layer1RequestLogger, appModelRouter);
  app.use(`${API_V1}/knowledge-base`,authenticate, layer1RequestLogger, knowledgeBaseRouter);
  app.use(`${API_V1}/traceability`,  authenticate, layer1RequestLogger, traceabilityRouter);
  // Requirements are nested under /projects — registered separately alongside
  // the existing projects router (Option B, hard migration)
  app.use(`${API_V1}/projects`,      authenticate, layer1RequestLogger, requirementsRouter);

  // Feedback nested under test-cases: /test-cases/:testCaseId/feedback
  app.use(`${API_V1}/test-cases`,    authenticate, layer1RequestLogger, feedbackRouter);
  app.use(`${API_V1}/templates`,     authenticate, layer1RequestLogger, templatesRouter);

  // Layer 2
  app.use(`${API_V1}/technique-engine`, authenticate, techniqueEngineRouter);
  app.use(`${API_V1}/risk-prioritization`, authenticate, riskPrioritizationRouter);
  app.use(`${API_V1}/coverage-gap`, authenticate, coverageGapRouter);

  // Layer 3
  app.use(`${API_V1}/test-cases`, authenticate, testCaseGeneratorRouter);
  app.use(`${API_V1}/scripts`, authenticate, scriptGeneratorRouter);
  app.use(`${API_V1}/test-data`, authenticate, testDataGeneratorRouter);

  // Layer 4
  app.use(`${API_V1}/runner`, authenticate, runnerRouter);
  app.use(`${API_V1}/environments`, authenticate, environmentRouter);
  app.use(`${API_V1}/cicd`, authenticate, cicdRouter);

  // Layer 5
  app.use(`${API_V1}/results`, authenticate, resultClassifierRouter);
  app.use(`${API_V1}/self-healing`, authenticate, selfHealingRouter);
  app.use(`${API_V1}/coverage-analytics`, authenticate, coverageAnalyticsRouter);

  // Layer 6
  app.use(`${API_V1}/review-gates`, authenticate, reviewGatesRouter);
  app.use(`${API_V1}/versioning`, authenticate, versioningRouter);
  app.use(`${API_V1}/explainability`, authenticate, explainabilityRouter);
  app.use(`${API_V1}/rbac`, authenticate, rbacRouter);
}
