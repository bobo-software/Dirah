import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller';
import type { AuthService } from '../services/AuthService';
import type { CryptoService } from '../services/CryptoService';
import { requireAuth } from '../middlewares/auth';
import { createCryptoController } from '../controllers/crypto.controller';
import { createOAuthController } from '../controllers/oauth.controller';
import type { OAuthService } from '../services/OAuthService';

export function createAuthRouter(
  authService: AuthService,
  cryptoService: CryptoService,
  oauthService: OAuthService
): Router {
  const router = Router();
  const controller = createAuthController(authService);
  const crypto = createCryptoController(cryptoService);
  const oauth = createOAuthController(oauthService);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/oauth/status', oauth.status);
  router.get('/oauth/:provider/start', oauth.start);
  router.get('/oauth/:provider/callback', oauth.callback);
  router.get('/me', requireAuth, controller.me);
  router.get('/crypto', requireAuth, crypto.getMine);
  router.put('/crypto', requireAuth, crypto.putMine);

  return router;
}
