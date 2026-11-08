import { z } from 'zod';
import { HttpError } from '../../utils/HttpError';
import { toolError } from '../../utils/publicError';
import { ASSET_ROLES } from '../../services/AssetService';
import type { AssetsMcpService } from '../../services/AssetsMcpService';
import type { PgMcpServerHost } from '../registerPgTools';
import { currentDocsAuth } from './authContext';

const workspaceFields = {
  workspaceId: z.string().uuid().optional(),
  workspace: z.string().min(1).optional(),
};

const refFields = {
  path: z.string().min(1).max(1_000).optional().describe('Asset path from list_tree or search_assets, e.g. refs/characters/hero.png'),
  nodeId: z.string().uuid().optional().describe('Asset id, instead of path'),
};

const ttlField = z
  .number()
  .int()
  .min(60)
  .max(24 * 3600)
  .optional()
  .describe('Lifetime of the temporary links in seconds (default 3600, max 86400)');

const metadataFields = {
  title: z.string().max(300).optional(),
  description: z
    .string()
    .max(10_000)
    .optional()
    .describe('What the reference shows: subject, look, lighting, camera, mood. Searchable.'),
  tags: z.array(z.string().max(100)).max(32).optional().describe('Replaces all tags, e.g. ["hero", "night", "neon"]'),
  role: z.enum(ASSET_ROLES).optional().describe('What the reference is for in a generation'),
  promptHint: z.string().max(4_000).optional().describe('Wording to reuse in generation prompts for this reference'),
  sourceUrl: z.string().max(2_000).nullable().optional(),
  license: z.string().max(500).nullable().optional(),
  generation: z
    .object({
      model: z.string().max(200).optional(),
      prompt: z.string().max(20_000).optional(),
      sourceAssetIds: z.array(z.string().uuid()).max(50).optional(),
      params: z.record(z.string(), z.unknown()).optional(),
    })
    .nullable()
    .optional()
    .describe('Provenance when this asset is a generator output: model, prompt, reference asset ids, params'),
};

type Content = Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;

function ok(data: unknown, image?: { body: Buffer; mime: string } | null) {
  const content: Content = [{ type: 'text', text: JSON.stringify({ success: true, data }, null, 2) }];
  if (image) content.push({ type: 'image', data: image.body.toString('base64'), mimeType: image.mime });
  return { content };
}

function fail(error: unknown) {
  const { message, code, details } = toolError(error);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: false, message, error: code, details }, null, 2) }],
    isError: true,
  };
}

export function registerAssetTools(server: PgMcpServerHost, service: AssetsMcpService): void {
  async function inWorkspace<T>(
    tool: string,
    args: { workspaceId?: string; workspace?: string },
    fn: (workspaceId: string) => Promise<T>,
    toContent: (result: T) => ReturnType<typeof ok> = (result) => ok(result)
  ) {
    const auth = currentDocsAuth();
    let workspaceId: string | null = null;
    try {
      const resolved = await service.resolveWorkspace(
        auth.userId,
        auth.tokenId,
        args.workspaceId ?? args.workspace,
        auth.defaultWorkspaceId
      );
      if (!resolved) throw new HttpError('workspace or workspaceId is required', 400, 'WORKSPACE_REQUIRED');
      workspaceId = resolved.workspaceId;
      const result = await fn(resolved.workspaceId);
      void service.recordAudit({ userId: auth.userId, tokenId: auth.tokenId, workspaceId, tool, outcome: 'ok' });
      return toContent(result);
    } catch (error) {
      void service.recordAudit({
        userId: auth.userId,
        tokenId: auth.tokenId,
        workspaceId,
        tool,
        outcome: (error instanceof HttpError ? error.code : undefined) ?? 'error',
      });
      return fail(error);
    }
  }

  server.registerTool(
    'search_assets',
    {
      title: 'Search media assets',
      description:
        'Find reference media (images, video, audio, 3D models) for generation. Matches title, description, tags, prompt hints and generation prompts. Filter by mediaType, role (character, style, location, prop, motion, audio, storyboard, generated, other), tags (all must match) and folder (path prefix; includes subfolders). Returns paths to pass to get_asset or get_asset_urls.',
      inputSchema: z.object({
        ...workspaceFields,
        query: z.string().max(500).optional(),
        mediaType: z.enum(['image', 'video', 'audio', 'model']).optional(),
        role: z.enum(ASSET_ROLES).optional(),
        tags: z.array(z.string().max(100)).max(16).optional(),
        folder: z.string().max(1_000).optional(),
        status: z.enum(['processing', 'ready', 'failed']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    },
    (async (args: Parameters<AssetsMcpService['search']>[3] & { workspaceId?: string; workspace?: string }) =>
      inWorkspace('search_assets', args, (workspaceId) => {
        const auth = currentDocsAuth();
        return service.search(auth.userId, auth.tokenId, workspaceId, args);
      })) as never
  );

  server.registerTool(
    'get_asset',
    {
      title: 'Get media asset',
      description:
        'Open one media asset: its details, a temporary public url to hand to a video/image generator, and an inline preview so you can see it: the image itself (resized), a 3x3 contact sheet of frames for video, or a waveform for audio. Links expire (default 1 hour); call again for fresh ones. Set includePreview false to skip the image.',
      inputSchema: z.object({
        ...workspaceFields,
        ...refFields,
        ttlSeconds: ttlField,
        includePreview: z.boolean().optional(),
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; path?: string; nodeId?: string; ttlSeconds?: number; includePreview?: boolean }) =>
      inWorkspace(
        'get_asset',
        args,
        (workspaceId) => {
          const auth = currentDocsAuth();
          return service.get(auth.userId, auth.tokenId, workspaceId, args);
        },
        (result) => ok(result.data, result.image)
      )) as never
  );

  server.registerTool(
    'get_asset_urls',
    {
      title: 'Get media asset links',
      description:
        'Temporary public links for several assets at once, in the order given, with each one\'s role, size and prompt hint. Use this to build the reference list for a generation call (e.g. character + style + location refs). Links expire (default 1 hour).',
      inputSchema: z.object({
        ...workspaceFields,
        assets: z
          .array(z.object(refFields))
          .min(1)
          .max(50)
          .describe('Assets by path or nodeId, e.g. [{"path":"refs/hero.png"},{"nodeId":"..."}]'),
        ttlSeconds: ttlField,
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; assets: Array<{ path?: string; nodeId?: string }>; ttlSeconds?: number }) =>
      inWorkspace('get_asset_urls', args, (workspaceId) => {
        const auth = currentDocsAuth();
        return service.urls(auth.userId, auth.tokenId, workspaceId, { refs: args.assets, ttlSeconds: args.ttlSeconds });
      })) as never
  );

  server.registerTool(
    'import_asset',
    {
      title: 'Import media asset',
      description:
        'Save an image, video, audio or 3D model file from a public https URL into the workspace, typically a generator\'s output. For a file on your own machine use upload_asset (up to 10 MB) or create_asset_upload (any size). Creates missing folders in folder (e.g. generated/scene-03). Record provenance in generation (model, prompt, sourceAssetIds of the references used). Thumbnails and previews are made in the background.',
      inputSchema: z.object({
        ...workspaceFields,
        url: z.string().url().max(2_000),
        folder: z.string().max(1_000).optional().describe('Folder path; omit for the workspace root'),
        ...metadataFields,
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; url: string; folder?: string; title?: string } & Record<string, unknown>) =>
      inWorkspace('import_asset', args, (workspaceId) => {
        const auth = currentDocsAuth();
        const { url, folder, title, workspaceId: _w, workspace: _ws, ...metadata } = args;
        return service.importAsset(auth.userId, auth.tokenId, workspaceId, {
          url,
          folder,
          title,
          metadata: { ...metadata, role: (metadata.role as string | undefined) ?? 'generated' },
        });
      })) as never
  );

  server.registerTool(
    'upload_asset',
    {
      title: 'Upload media asset (inline)',
      description:
        'Store a local file you have as bytes: image, video, audio or 3D model (GLB, FBX, OBJ, .blend). Send it base64-encoded in data, up to 10 MB decoded. For bigger files (most video), call create_asset_upload instead and PUT the file to the link. Creates missing folders in folder. Previews (including a 3D turnaround) are made in the background.',
      inputSchema: z.object({
        ...workspaceFields,
        filename: z.string().min(1).max(200).describe('Original file name with extension, e.g. sbu-turnaround.png or sbu.glb'),
        data: z.string().min(1).describe('File contents, base64 (a data: URL prefix is allowed)'),
        folder: z.string().max(1_000).optional().describe('Folder path, e.g. corner-stories/characters/sbu; omit for the root'),
        ...metadataFields,
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; filename: string; data: string; folder?: string; title?: string } & Record<string, unknown>) =>
      inWorkspace('upload_asset', args, (workspaceId) => {
        const auth = currentDocsAuth();
        const { filename, data, folder, title, workspaceId: _w, workspace: _ws, ...metadata } = args;
        return service.uploadInline(auth.userId, auth.tokenId, workspaceId, { filename, data, folder, title, metadata });
      })) as never
  );

  server.registerTool(
    'create_asset_upload',
    {
      title: 'Create media upload link',
      description:
        'Get a single-use https link to upload a local file of any size (video, large 3D models) without base64. Then send the raw bytes with PUT, e.g. the returned curl command: curl --fail -T file.mp4 \'<uploadUrl>\'. The PUT response is the stored asset. The link expires in 15 minutes and works once.',
      inputSchema: z.object({
        ...workspaceFields,
        filename: z.string().min(1).max(200).describe('File name with extension, e.g. scene-03.mp4'),
        folder: z.string().max(1_000).optional(),
        byteSize: z.number().int().min(1).optional().describe('File size, to fail early when it is too large'),
        ...metadataFields,
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; filename: string; folder?: string; title?: string; byteSize?: number } & Record<string, unknown>) =>
      inWorkspace('create_asset_upload', args, (workspaceId) => {
        const auth = currentDocsAuth();
        const { filename, folder, title, byteSize, workspaceId: _w, workspace: _ws, ...metadata } = args;
        return service.createUpload(auth.userId, auth.tokenId, workspaceId, { filename, folder, title, byteSize, metadata });
      })) as never
  );

  server.registerTool(
    'update_asset',
    {
      title: 'Update media asset',
      description:
        'Edit an asset\'s title, description, tags, role, prompt hint, license, source or generation provenance. Look at it with get_asset first, then write a description that makes it easy to find with search_assets. tags replaces the whole list.',
      inputSchema: z.object({
        ...workspaceFields,
        ...refFields,
        ...metadataFields,
      }),
    },
    (async (args: { workspaceId?: string; workspace?: string; path?: string; nodeId?: string } & Record<string, unknown>) =>
      inWorkspace('update_asset', args, (workspaceId) => {
        const auth = currentDocsAuth();
        const { path, nodeId, workspaceId: _w, workspace: _ws, ...metadata } = args;
        return service.update(auth.userId, auth.tokenId, workspaceId, { path, nodeId, metadata });
      })) as never
  );
}
