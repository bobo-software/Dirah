import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller';
import type { AuthService } from '../services/AuthService';
import type { CryptoService } from '../services/CryptoService';
import { requireAuth } from '../middlewares/auth';
import { authLoginRateLimit, authPasswordResetRateLimit, authRefreshRateLimit } from '../middlewares/authRateLimit';
import { PasswordResetService } from '../services/PasswordResetService';
import { db } from '../db';
import { requireSessionOrigin } from '../middlewares/requireSessionOrigin';
import { createCryptoController } from '../controllers/crypto.controller';
import { createOAuthController } from '../controllers/oauth.controller';
import type { OAuthService } from '../services/OAuthService';

export function createAuthRouter(
  authService: AuthService,
  cryptoService: CryptoService,
  oauthService: OAuthService
): Router {
  const router = Router();
  const controller = createAuthController(authService, new PasswordResetService(db));
  const crypto = createCryptoController(cryptoService);
  const oauth = createOAuthController(oauthService);

  router.post('/register', requireSessionOrigin, authLoginRateLimit, controller.register);
  router.post('/login', requireSessionOrigin, authLoginRateLimit, controller.login);
  router.post('/refresh', requireSessionOrigin, authRefreshRateLimit, controller.refresh);
  router.post('/logout', requireSessionOrigin, authRefreshRateLimit, controller.logout);
  router.get('/oauth/status', oauth.status);
  router.get('/oauth/:provider/start', oauth.start);
  router.get('/oauth/:provider/callback', oauth.callback);
  router.post('/oauth/mobile-exchange', requireSessionOrigin, authLoginRateLimit, oauth.exchange);
  router.get('/me', requireAuth, controller.me);
  router.patch('/me', requireAuth, requireSessionOrigin, authLoginRateLimit, controller.updateProfile);
  router.post('/password', requireAuth, requireSessionOrigin, authLoginRateLimit, controller.changePassword);
  router.post('/password/forgot', requireSessionOrigin, authPasswordResetRateLimit, controller.forgotPassword);
  router.post('/password/reset', requireSessionOrigin, authPasswordResetRateLimit, controller.resetPassword);
  router.get('/crypto', requireAuth, crypto.getMine);
  router.put('/crypto', requireAuth, crypto.putMine);

  return router;
}
