import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { db, livePool, pool } from './db';
import { createApiRouter } from './routes';
import { getHealth } from './controllers/health.controller';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { requestTiming } from './middlewares/requestTiming';
import { mcpApiKeyMiddleware } from './middlewares/mcpApiKey';
import { createDirahMcpExpressHandler } from './mcp/createDirahMcpExpressHandler';
import { PgMcpService } from './services/mcp/PgMcpService';
import { AuthService } from './services/AuthService';
import { PageService } from './services/PageService';
import { NoteService } from './services/NoteService';
import { TaskListService } from './services/TaskListService';
import { TicketService } from './services/TicketService';
import { TicketsMcpService } from './services/TicketsMcpService';
import { BlobService } from './services/BlobService';
import { createBlobStore } from './blobs/blobStore';
import { MemberService } from './services/MemberService';
import { ShareService } from './services/ShareService';
import { AiService } from './services/AiService';
import { CryptoService } from './services/CryptoService';
import { OAuthService } from './services/OAuthService';
import { McpTokenService } from './services/McpTokenService';
import { DocsMcpService } from './services/DocsMcpService';
import { NotesMcpService } from './services/NotesMcpService';
import { createDocsMcpExpressHandler } from './mcp/docs/createDocsMcpExpressHandler';
import { createDocsMcpAuthMiddleware } from './middlewares/docsMcpAuth';
import { docsMcpRateLimit } from './middlewares/docsMcpRateLimit';
import { McpOAuthService } from './services/McpOAuthService';
import { SystemAdminAuthService } from './services/SystemAdminAuthService';
import { AdminService } from './services/AdminService';
import { createMcpOAuthPublicRouter, MCP_OAUTH_PUBLIC_PATHS } from './routes/mcpOAuth.routes';
import { defaultOAuthExchanger, type OAuthExchanger } from './oauth/providers';
import { convertBlockPagesIfNeeded } from './convert/convertBlockPages';

export interface CreateAppOptions {
  pgMcpService?: PgMcpService;
  livePgMcpService?: PgMcpService;
  authService?: AuthService;
  pageService?: PageService;
  blobService?: BlobService;
  aiService?: AiService;
  oauthExchanger?: OAuthExchanger;
}

export async function createApp(options: CreateAppOptions = {}): Promise<Express> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Helmet 8 sends HSTS on plain HTTP. Only advertise it once the edge connection is HTTPS.
      strictTransportSecurity: false,
    })
  );
  app.use((req, res, next) => {
    if (req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  });

  const appCors = cors({
    origin: env.corsOrigin,
    credentials: env.corsOrigin !== '*',
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,Accept,MCP-Protocol-Version,X-Dirah-Blob-Id,X-Dirah-Blob-Id',
    exposedHeaders: 'WWW-Authenticate',
  });
  // OAuth discovery/registration/token endpoints get their own open CORS policy (mcpOAuth.routes).
  app.use((req, res, next) => (MCP_OAUTH_PUBLIC_PATHS.test(req.path) ? next() : appCors(req, res, next)));
  app.use(express.json({ limit: '1.5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestTiming);

  try {
    await convertBlockPagesIfNeeded(db, pool);
  } catch (error) {
    console.warn('Block page conversion skipped', error);
  }

  const authService = options.authService ?? new AuthService(db);
  const pageService = options.pageService ?? new PageService(db, authService);
  const noteService = new NoteService(db, authService);
  const taskListService = new TaskListService(db, authService, noteService);
  const ticketService = new TicketService(db, authService);
  const blobService =
    options.blobService ?? new BlobService(db, authService, createBlobStore(env));
  const memberService = new MemberService(db, authService);
  const cryptoService = new CryptoService(db, authService);
  const oauthService = new OAuthService(
    db,
    authService,
    memberService,
    options.oauthExchanger ?? defaultOAuthExchanger
  );
  const mcpTokenService = new McpTokenService(db, authService);
  const docsMcpService = new DocsMcpService(pageService, mcpTokenService, {
    appPublicUrl: env.appPublicUrl,
  });
  const notesMcpService = new NotesMcpService(noteService, docsMcpService, {
    appPublicUrl: env.appPublicUrl,
  });
  const ticketsMcpService = new TicketsMcpService(ticketService, docsMcpService, {
    appPublicUrl: env.appPublicUrl,
  });
  const apiPublicUrl = env.apiPublicUrl;
  const mcpOAuthService = new McpOAuthService(db, apiPublicUrl, env.appPublicUrl, mcpTokenService);
  const shareService = new ShareService(db, authService, pageService);
  const systemAdminAuthService = new SystemAdminAuthService(db);
  const adminService = new AdminService(db);
  const aiService =
    options.aiService ??
    new AiService(pageService, {
      apiKey: env.ai.apiKey,
      baseUrl: env.ai.baseUrl,
      model: env.ai.model,
    });

  if (env.systemAdminEmail && env.systemAdminPassword) {
    try {
      await systemAdminAuthService.bootstrapFromEnv(env.systemAdminEmail, env.systemAdminPassword);
    } catch (error) {
      console.warn('System admin bootstrap skipped', error);
    }
  }

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
      mcpOAuthService,
      systemAdminAuthService,
      adminService,
      noteService,
      taskListService,
      ticketService
    )
  );

  app.use(createMcpOAuthPublicRouter(mcpOAuthService));

  const pgMcpService =
    options.pgMcpService ??
    new PgMcpService({
      pool,
      database: env.db.database,
    });
  const livePgMcpService =
    options.livePgMcpService ??
    new PgMcpService({
      pool: livePool,
      database: env.liveDb.database,
    });

  const mcpHandler = await createDirahMcpExpressHandler({
    pg: pgMcpService,
    livePg: livePgMcpService,
  });
  app.all('/mcp/protocol', mcpApiKeyMiddleware, mcpHandler);

  const docsMcpHandler = await createDocsMcpExpressHandler(docsMcpService, notesMcpService, ticketsMcpService);
  app.all(
    '/mcp',
    createDocsMcpAuthMiddleware({
      tokens: mcpTokenService,
      apiPublicUrl,
      resource: mcpOAuthService.resource,
    }),
    docsMcpRateLimit,
    docsMcpHandler
  );

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
