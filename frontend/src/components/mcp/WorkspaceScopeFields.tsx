import {
  MCP_WORKSPACE_SCOPE_LABELS,
  type McpWorkspaceScope,
} from '../../api/mcp';

export type ScopeWorkspace = {
  id: string;
  name: string;
  mcpEnabled?: boolean;
};

interface WorkspaceScopeFieldsProps {
  value: McpWorkspaceScope;
  onChange: (scope: McpWorkspaceScope) => void;
  /** Workspaces the token can reach, used for the default picker and the warning count. */
  workspaces: ScopeWorkspace[];
  defaultWorkspaceId?: string | null;
  onDefaultChange?: (workspaceId: string) => void;
  /** Unique per instance so multiple forms don't share one native radio group. */
  groupName?: string;
}

const DESCRIPTIONS: Record<McpWorkspaceScope, string> = {
  selected: 'Pick individual workspaces, and whether this token can write to them.',
  all: 'Read and write in every workspace you can access, including ones you join later.',
  all_read_only: 'Read every workspace you can access, including ones you join later. Never writes.',
};

export default function WorkspaceScopeFields({
  value,
  onChange,
  workspaces,
  defaultWorkspaceId,
  onDefaultChange,
  groupName = 'mcp-workspace-scope',
}: WorkspaceScopeFieldsProps) {
  const all = value !== 'selected';
  const reachable = workspaces.filter((workspace) => workspace.mcpEnabled !== false);

  return (
    <div className="mcp-scope-fields">
      <fieldset className="mcp-scope-options">
        <legend className="mcp-field-label">Access</legend>
        {(['selected', 'all', 'all_read_only'] as McpWorkspaceScope[]).map((scope) => (
          <label key={scope} className={`mcp-scope-option${value === scope ? ' on' : ''}`}>
            <input
              type="radio"
              name={groupName}
              value={scope}
              checked={value === scope}
              onChange={() => onChange(scope)}
            />
            <span className="mcp-scope-option-text">
              <strong>{MCP_WORKSPACE_SCOPE_LABELS[scope]}</strong>
              <span className="muted">{DESCRIPTIONS[scope]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {all ? (
        <p className="mcp-scope-warning" role="note">
          Covers every workspace you can reach now, and any you join later ({reachable.length} today).
          Encrypted workspaces are never included, and an owner can still switch MCP off per workspace.
        </p>
      ) : null}

      {all && onDefaultChange ? (
        <label className="mcp-field">
          <span className="mcp-field-label">Default workspace</span>
          <select
            value={defaultWorkspaceId ?? ''}
            onChange={(event) => onDefaultChange(event.target.value)}
            aria-label="Default workspace"
          >
            <option value="">No default</option>
            {reachable.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <span className="mcp-field-hint">Used when an agent does not name a workspace.</span>
        </label>
      ) : null}
    </div>
  );
}
