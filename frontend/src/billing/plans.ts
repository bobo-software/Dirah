/* Plan catalogue. Billing is not live yet: the pricing section shows these
   plans, but only Free can be chosen until BILLING_ENABLED is turned on.
   Limits are not enforced anywhere yet either; this is the single source
   the UI (and later the backend) should read from. */
export const BILLING_ENABLED = false;

export type PlanId = 'free' | 'bronze' | 'silver' | 'gold';

/* null means unlimited. */
export type PlanLimits = {
  workspaces: number | null;
  membersPerWorkspace: number | null;
  agentConnections: number | null;
  storageGb: number;
  askPerMonth: number;
};

export type Plan = {
  id: PlanId;
  name: string;
  /* Monthly price in South African rand. */
  priceZar: number;
  summary: string;
  limits: PlanLimits;
  extras: string[];
  recommended?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    priceZar: 0,
    summary: 'For trying Dirah with your own agents.',
    limits: { workspaces: 3, membersPerWorkspace: 3, agentConnections: 3, storageGb: 1, askPerMonth: 50 },
    extras: [],
  },
  {
    id: 'bronze',
    name: 'Bronze',
    priceZar: 50,
    summary: 'For individuals who rely on their agents every day.',
    limits: { workspaces: 10, membersPerWorkspace: 10, agentConnections: 10, storageGb: 10, askPerMonth: 500 },
    extras: [],
  },
  {
    id: 'silver',
    name: 'Silver',
    priceZar: 80,
    summary: 'For small teams sharing one source of truth.',
    limits: { workspaces: 25, membersPerWorkspace: 25, agentConnections: 25, storageGb: 50, askPerMonth: 2000 },
    extras: [],
    recommended: true,
  },
  {
    id: 'gold',
    name: 'Gold',
    priceZar: 120,
    summary: 'For teams that want no limits to think about.',
    limits: { workspaces: null, membersPerWorkspace: null, agentConnections: null, storageGb: 200, askPerMonth: 10000 },
    extras: ['Priority email support'],
  },
];

const count = new Intl.NumberFormat('en-ZA');

function limit(value: number | null, singular: string, plural: string) {
  if (value === null) return `Unlimited ${plural}`;
  return `${count.format(value)} ${value === 1 ? singular : plural}`;
}

/* The plan's limits as the short lines shown on the pricing section. */
export function planLines(plan: Plan): string[] {
  const { limits } = plan;
  return [
    limit(limits.workspaces, 'workspace', 'workspaces'),
    `${limit(limits.membersPerWorkspace, 'member', 'members')} per workspace`,
    limit(limits.agentConnections, 'agent connection', 'agent connections'),
    `${count.format(limits.storageGb)} GB file storage`,
    `${count.format(limits.askPerMonth)} Ask questions a month`,
    ...plan.extras,
  ];
}

export function formatZar(amount: number) {
  return `R${count.format(amount)}`;
}
