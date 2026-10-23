-- A hidden membership keeps its role, but the member can no longer see or open the workspace.
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "hidden" boolean DEFAULT false NOT NULL;
