import express, { type Express } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { db, pool } from './db';
import { createApiRouter } from './routes';
import { getHealth } from './controllers/health.controller';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { mcpApiKeyMiddleware } from './middlewares/mcpApiKey';
import { createDiraMcpExpressHandler } from './mcp/createDiraMcpExpressHandler';
import { PgMcpService } from './services/mcp/PgMcpService';
import { AuthService } from './services/AuthService';
import { PageService } from './services/PageService';
import { BlobService } from './services/BlobService';
import { createBlobStore } from './blobs/blobStore';
import { MemberService } from './services/MemberService';
import { ShareService } from './services/ShareService';
import { AiService } from './services/AiService';
import { CryptoService } from './services/CryptoService';
import { OAuthService } from './services/OAuthService';
import { McpTokenService } from './services/McpTokenService';
import { DocsMcpService } from './services/DocsMcpService';
import { createDocsMcpExpressHandler } from './mcp/docs/createDocsMcpExpressHandler';
import { createDocsMcpAuthMiddleware } from './middlewares/docsMcpAuth';
import { docsMcpRateLimit } from './middlewares/docsMcpRateLimit';
import { McpOAuthService } from './services/McpOAuthService';
import { createMcpOAuthPublicRouter } from './routes/mcpOAuth.routes';
import { defaultOAuthExchanger, type OAuthExchanger } from './oauth/providers';
import { convertBlockPagesIfNeeded } from './convert/convertBlockPages';

export interface CreateAppOptions {
  pgMcpService?: PgMcpService;
  authService?: AuthService;
  pageService?: PageService;
  blobService?: BlobService;
  aiService?: AiService;
  oauthExchanger?: OAuthExchanger;
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const app = express();

  app.use(
    cors({
      origin: env.corsOrigin,
      methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Authorization,Accept,MCP-Protocol-Version,X-Dira-Blob-Id',
    })
  );
  app.use(express.json({ limit: '1.5mb' }));
  app.use(express.urlencoded({ extended: true }));

  try {
    await convertBlockPagesIfNeeded(db, pool);
  } catch (error) {
    console.warn('Block page conversion skipped', error);
  }

  const authService = options.authService ?? new AuthService(db);
  const pageService = options.pageService ?? new PageService(db, authService);
  const blobService =
    options.blobService ?? new BlobService(db, authService, createBlobStore(env));
  const memberService = new MemberService(db, authService);
  const cryptoService = new CryptoService(db, authService);
  const oauthService = new OAuthService(
    db,
    authService,
    options.oauthExchanger ?? defaultOAuthExchanger
  );
  const mcpTokenService = new McpTokenService(db, authService);
  const docsMcpService = new DocsMcpService(pageService, mcpTokenService, {
    appPublicUrl: env.appPublicUrl,
  });
  const apiPublicUrl =
    (process.env.API_PUBLIC_URL ?? '').trim().replace(/\/$/, '') || `http://localhost:${env.port}`;
  const mcpOAuthService = new McpOAuthService(db, apiPublicUrl, env.appPublicUrl, mcpTokenService);
  const shareService = new ShareService(db, authService, pageService);
  const aiService =
    options.aiService ??
    new AiService(pageService, {
      apiKey: env.ai.apiKey,
      baseUrl: env.ai.baseUrl,
      model: env.ai.model,
    });

  app.get('/health', getHealth);
  app.use(
    '/api',
    createApiRouter(
      authService,
      pageService,
      blobService,
      memberService,
      shareService,
      aiService,
      cryptoService,
      oauthService,
      mcpTokenService,
      mcpOAuthService
    )
  );

  app.use(createMcpOAuthPublicRouter(mcpOAuthService));

  const pgMcpService =
    options.pgMcpService ??
    new PgMcpService({
      pool,
      database: env.db.database,
    });

  const mcpHandler = await createDiraMcpExpressHandler({ pg: pgMcpService });
  app.all('/mcp/protocol', mcpApiKeyMiddleware, mcpHandler);

  const docsMcpHandler = await createDocsMcpExpressHandler(docsMcpService);
  app.all(
    '/mcp',
    createDocsMcpAuthMiddleware({ tokens: mcpTokenService, apiPublicUrl }),
    docsMcpRateLimit,
    docsMcpHandler
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
