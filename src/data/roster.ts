/**
 * THE authoritative agent roster — exactly 30 agents.
 * docs/ROSTER.md mirrors this table and a unit test enforces that they match.
 * Every other module imports from here; no other file may declare agents.
 */

export const DEPARTMENTS = [
  'orchestrator',
  'engineering',
  'infra-ops',
  'integrations',
  'customer',
  'marketing-design',
  'c-suite',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  orchestrator: 'Orchestrator',
  engineering: 'Engineering',
  'infra-ops': 'Infra & Ops',
  integrations: 'Integrations',
  customer: 'Customer',
  'marketing-design': 'Marketing & Design',
  'c-suite': 'C-suite',
};

export interface RosterAgent {
  /** Stable kebab-case id — also the asset filename stem. */
  readonly id: string;
  /** Display name (character). */
  readonly name: string;
  /** Company role title. */
  readonly role: string;
  readonly department: Department;
  /** agent-cpd-* role slug used by the legacy dashboard + live feed. */
  readonly cpdRole: string;
}

export const ROSTER: readonly RosterAgent[] = [
  // Orchestrator
  {
    id: 'sung-jin-woo',
    name: 'Sung Jin-Woo',
    role: 'Orchestrator',
    department: 'orchestrator',
    cpdRole: 'orchestrator',
  },
  // Engineering
  {
    id: 'senku',
    name: 'Senku',
    role: 'Architect',
    department: 'engineering',
    cpdRole: 'architect',
  },
  {
    id: 'edward-elric',
    name: 'Edward Elric',
    role: 'Module Builder',
    department: 'engineering',
    cpdRole: 'module-builder',
  },
  {
    id: 'franky',
    name: 'Franky',
    role: 'Worker Builder',
    department: 'engineering',
    cpdRole: 'worker-builder',
  },
  {
    id: 'sai',
    name: 'Sai',
    role: 'Frontend Builder',
    department: 'engineering',
    cpdRole: 'frontend-builder',
  },
  {
    id: 'kurapika',
    name: 'Kurapika',
    role: 'Data Modeler',
    department: 'engineering',
    cpdRole: 'data-modeler',
  },
  {
    id: 'gojo-satoru',
    name: 'Gojo Satoru',
    role: 'AI Engineer',
    department: 'engineering',
    cpdRole: 'ai-engineer',
  },
  {
    id: 'levi',
    name: 'Levi',
    role: 'Test Author',
    department: 'engineering',
    cpdRole: 'test-author',
  },
  {
    id: 'sanji',
    name: 'Sanji',
    role: 'Data Seeder',
    department: 'engineering',
    cpdRole: 'data-seeder',
  },
  // Infra & Ops
  {
    id: 'kisuke-urahara',
    name: 'Kisuke Urahara',
    role: 'DevOps',
    department: 'infra-ops',
    cpdRole: 'devops',
  },
  {
    id: 'yamato',
    name: 'Yamato',
    role: 'Infrastructure',
    department: 'infra-ops',
    cpdRole: 'infrastructure',
  },
  {
    id: 'trafalgar-law',
    name: 'Trafalgar Law',
    role: 'Provisioning',
    department: 'infra-ops',
    cpdRole: 'provisioning',
  },
  {
    id: 'reborn',
    name: 'Reborn',
    role: 'Release Manager',
    department: 'infra-ops',
    cpdRole: 'release-manager',
  },
  {
    id: 'itachi-uchiha',
    name: 'Itachi Uchiha',
    role: 'Security Reviewer',
    department: 'infra-ops',
    cpdRole: 'security-reviewer',
  },
  {
    id: 'nami',
    name: 'Nami',
    role: 'Resource Manager',
    department: 'infra-ops',
    cpdRole: 'resource-manager',
  },
  // Integrations
  {
    id: 'tanjiro-kamado',
    name: 'Tanjiro Kamado',
    role: 'Integrations Engineer',
    department: 'integrations',
    cpdRole: 'integrations-engineer',
  },
  {
    id: 'finral-roulacase',
    name: 'Finral Roulacase',
    role: 'Email Specialist',
    department: 'integrations',
    cpdRole: 'email-specialist',
  },
  {
    id: 'askeladd',
    name: 'Askeladd',
    role: 'Billing Specialist',
    department: 'integrations',
    cpdRole: 'billing-specialist',
  },
  // Customer
  {
    id: 'mitsuri-kanroji',
    name: 'Mitsuri Kanroji',
    role: 'Customer Success',
    department: 'customer',
    cpdRole: 'customer-success',
  },
  {
    id: 'thorfinn',
    name: 'Thorfinn',
    role: 'Support Engineer',
    department: 'customer',
    cpdRole: 'support-engineer',
  },
  {
    id: 'nico-robin',
    name: 'Nico Robin',
    role: 'Docs Writer',
    department: 'customer',
    cpdRole: 'docs-writer',
  },
  {
    id: 'riza-hawkeye',
    name: 'Riza Hawkeye',
    role: 'Compliance',
    department: 'customer',
    cpdRole: 'compliance',
  },
  // Marketing & Design
  {
    id: 'lelouch-lamperouge',
    name: 'Lelouch Lamperouge',
    role: 'Marketing Strategist',
    department: 'marketing-design',
    cpdRole: 'marketing-strategist',
  },
  {
    id: 'light-yagami',
    name: 'Light Yagami',
    role: 'Marketing Writer',
    department: 'marketing-design',
    cpdRole: 'marketing-writer',
  },
  {
    id: 'mei-hatsume',
    name: 'Mei Hatsume',
    role: 'Designer',
    department: 'marketing-design',
    cpdRole: 'designer',
  },
  {
    id: 'hange-zoe',
    name: 'Hange Zoe',
    role: 'Prospect Researcher',
    department: 'marketing-design',
    cpdRole: 'prospect-researcher',
  },
  // C-suite
  { id: 'erwin-smith', name: 'Erwin Smith', role: 'CEO', department: 'c-suite', cpdRole: 'ceo' },
  { id: 'nanami-kento', name: 'Nanami Kento', role: 'CFO', department: 'c-suite', cpdRole: 'cfo' },
  { id: 'armin-arlert', name: 'Armin Arlert', role: 'CIO', department: 'c-suite', cpdRole: 'cio' },
  { id: 'l', name: 'L', role: 'Data Analyst', department: 'c-suite', cpdRole: 'data-analyst' },
] as const;

export const ROSTER_BY_ID: ReadonlyMap<string, RosterAgent> = new Map(ROSTER.map((a) => [a.id, a]));

export function agentById(id: string): RosterAgent | undefined {
  return ROSTER_BY_ID.get(id);
}
