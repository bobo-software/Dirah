import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller';
import type { AuthService } from '../services/AuthService';
import type { CryptoService } from '../services/CryptoService';
import { requireAuth } from '../middlewares/auth';
import { createCryptoController } from '../controllers/crypto.controller';

export function createAuthRouter(authService: AuthService, cryptoService: CryptoService): Router {
  const router = Router();
  const controller = createAuthController(authService);
  const crypto = createCryptoController(cryptoService);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', requireAuth, controller.me);
  router.get('/crypto', requireAuth, crypto.getMine);
  router.put('/crypto', requireAuth, crypto.putMine);

  return router;
}
