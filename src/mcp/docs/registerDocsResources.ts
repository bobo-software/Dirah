import type { DocsMcpService } from '../../services/DocsMcpService';
import type { PgMcpServerHost } from '../registerPgTools';
import { currentDocsAuth } from './authContext';
import { buildDynamicInstructions } from './instructions';

export function registerDocsResources(
  server: PgMcpServerHost,
  service: DocsMcpService,
  ResourceTemplate: new (
    template: string,
    options: { list: () => Promise<{ resources: Array<{ uri: string; name: string }> }> }
  ) => unknown
): void {
  server.registerResource(
    'dira-guide',
    'dira://guide',
    { title: 'Dira usage guide', description: 'Search-first guidance and this token\'s allowlisted workspaces.', mimeType: 'text/plain' },
    (async (uri: URL) => {
      const auth = currentDocsAuth();
      const guide = await service.buildGuide(auth.userId, auth.defaultWorkspaceId);
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: buildDynamicInstructions(guide) }] };
    }) as never
  );

  server.registerResource(
    'dira-doc',
    new ResourceTemplate('dira://{workspace}/{+path}', {
      list: async () => {
        const auth = currentDocsAuth();
        const rows = await service.listWorkspaces(auth.userId);
        return {
          resources: rows.map((row) => ({
            uri: `dira://${row.slug}/readme.md`,
            name: `${row.name} README`,
          })),
        };
      },
    }),
    { title: 'Dira document', description: 'A markdown document addressed by workspace slug and path.', mimeType: 'text/markdown' },
    (async (uri: URL, variables?: Record<string, string | string[]>) => {
      const auth = currentDocsAuth();
      const workspaceRef = Array.isArray(variables?.workspace) ? variables?.workspace[0] : variables?.workspace;
      const pathRef = Array.isArray(variables?.path) ? variables?.path.join('/') : variables?.path;
      const workspace = await service.resolveWorkspace(auth.userId, workspaceRef ?? null, {
        defaultWorkspaceId: auth.defaultWorkspaceId,
      });
      if (!workspace || !pathRef) {
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: '' }] };
      }
      const file = await service.readFile(auth.userId, workspace.workspaceId, { path: pathRef });
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: file.content }] };
    }) as never
  );
}
