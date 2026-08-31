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
import { DocSyncService } from './services/DocSyncService';
import { MemberService } from './services/MemberService';
import { ShareService } from './services/ShareService';
import { AiService } from './services/AiService';
import { CryptoService } from './services/CryptoService';
import { OAuthService } from './services/OAuthService';
import { defaultOAuthExchanger, type OAuthExchanger } from './oauth/providers';

export interface CreateAppOptions {
  pgMcpService?: PgMcpService;
  authService?: AuthService;
  pageService?: PageService;
  blobService?: BlobService;
  docSyncService?: DocSyncService;
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
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
  const shareService = new ShareService(db, authService, pageService);
  const docSyncService =
    options.docSyncService ??
    new DocSyncService(db, pageService, env.snapshotEvery, authService, shareService);
  const aiService =
    options.aiService ??
    new AiService(pageService, {
      apiKey: env.ai.apiKey,
      baseUrl: env.ai.baseUrl,
      model: env.ai.model,
    });

  app.set('docSync', docSyncService);

  app.get('/health', getHealth);
  app.use(
    '/api',
    createApiRouter(
      authService,
      pageService,
      blobService,
      docSyncService,
      memberService,
      shareService,
      aiService,
      cryptoService,
      oauthService
    )
  );

  const pgMcpService =
    options.pgMcpService ??
    new PgMcpService({
      pool,
      database: env.db.database,
    });

  const mcpHandler = await createDiraMcpExpressHandler({ pg: pgMcpService });
  app.all('/mcp/protocol', mcpApiKeyMiddleware, mcpHandler);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export function getDocSync(app: Express): DocSyncService {
  return app.get('docSync') as DocSyncService;
}
