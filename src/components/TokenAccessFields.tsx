export type TokenAccessFieldsWorkspace = {
  id: string;
  name: string;
  role: string;
  mcpEnabled?: boolean;
};

export type TokenAccessValue = {
  allowlisted: boolean;
  canWrite: boolean;
};

interface TokenAccessFieldsProps {
  workspaces: TokenAccessFieldsWorkspace[];
  value: Map<string, TokenAccessValue>;
  defaultWorkspaceId?: string | null;
  onChange: (workspaceId: string, patch: Partial<TokenAccessValue>) => void;
  onDefaultChange?: (workspaceId: string) => void;
  /** Unique per instance so multiple expanded token panels don't share one native radio group. */
  groupName?: string;
}

type AccessLevel = 'none' | 'read' | 'write';

const LEVELS: { key: AccessLevel; label: string }[] = [
  { key: 'none', label: 'No access' },
  { key: 'read', label: 'Read' },
  { key: 'write', label: 'Read & write' },
];

function levelOf(entry: TokenAccessValue): AccessLevel {
  if (!entry.allowlisted) return 'none';
  return entry.canWrite ? 'write' : 'read';
}

function canWriteForRole(role: string): boolean {
  return role !== 'viewer';
}

function capitalize(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase();
}

export default function TokenAccessFields({
  workspaces,
  value,
  defaultWorkspaceId,
  onChange,
  onDefaultChange,
  groupName = 'token-default-workspace',
}: TokenAccessFieldsProps) {
  const grantedCount = Array.from(value.values()).filter((v) => v.allowlisted).length;
  const showDefault = Boolean(onDefaultChange) && grantedCount >= 2;

  return (
    <div className="access-fields">
      {workspaces.map((workspace) => {
        const entry = value.get(workspace.id) ?? { allowlisted: false, canWrite: false };
        const level = levelOf(entry);
        const mcpOff = workspace.mcpEnabled === false;

        return (
          <div className="access-row" key={workspace.id}>
            <div className="access-row-id">
              <span className="workspace-avatar" aria-hidden="true">
                {initialOf(workspace.name)}
              </span>
              <div className="access-row-text">
                <strong>{workspace.name}</strong>
                <span className="muted">{capitalize(workspace.role)}</span>
              </div>
            </div>

            {mcpOff ? (
              <span className="muted access-off-note">MCP is off for this workspace</span>
            ) : (
              <div className="access-row-controls">
                <div className="access-segmented" role="group" aria-label={`Access level for ${workspace.name}`}>
                  {LEVELS.map((lvl) => {
                    const disabled = lvl.key === 'write' && !canWriteForRole(workspace.role);
                    return (
                      <button
                        key={lvl.key}
                        type="button"
                        className={`access-segment${level === lvl.key ? ' on' : ''}${lvl.key === 'write' ? ' write' : ''}`}
                        aria-pressed={level === lvl.key}
                        disabled={disabled}
                        title={disabled ? "Viewers can't be granted write access" : undefined}
                        onClick={() => {
                          if (lvl.key === 'none') onChange(workspace.id, { allowlisted: false, canWrite: false });
                          else if (lvl.key === 'read') onChange(workspace.id, { allowlisted: true, canWrite: false });
                          else onChange(workspace.id, { allowlisted: true, canWrite: true });
                        }}
                      >
                        {lvl.label}
                      </button>
                    );
                  })}
                </div>

                {showDefault && level !== 'none' ? (
                  <label className="access-default">
                    <input
                      type="radio"
                      name={groupName}
                      checked={defaultWorkspaceId === workspace.id}
                      onChange={() => onDefaultChange?.(workspace.id)}
                    />
                    Default
                  </label>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
