import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validateRequest } from '../../middleware/validate.middleware';
import { registerSchema, loginSchema, refreshTokenSchema } from './auth.schema';

const router = Router();
const controller = new AuthController();

// POST /api/v1/auth/register
router.post('/register', validateRequest(registerSchema), controller.register);

// POST /api/v1/auth/login
router.post('/login', validateRequest(loginSchema), controller.login);

// POST /api/v1/auth/refresh
router.post('/refresh', validateRequest(refreshTokenSchema), controller.refreshToken);

// POST /api/v1/auth/logout
router.post('/logout', controller.logout);

export default router;
