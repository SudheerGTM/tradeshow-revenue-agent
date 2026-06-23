import {
  LayoutDashboard, CalendarDays, Users, Mail,
  RefreshCw, BarChart2, Settings, ShieldCheck, UserPlus, Zap, Briefcase, Kanban, Bot, Workflow,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  release: number;
  roles?: string[];
}

// Conversation Intelligence, Company Intelligence, and Lead Scoring are not
// standalone pages — they live as tabs inside /leads/[id] (the Lead Details
// workspace). They never had top-level routes, so they're intentionally
// omitted here rather than linking to a 404.
export const NAV: NavItem[] = [
  { href: "/dashboard",          label: "Dashboard",               icon: LayoutDashboard, release: 1 },
  { href: "/events",             label: "Events",                  icon: CalendarDays,    release: 3 },
  { href: "/leads",              label: "Lead Intelligence",       icon: Users,           release: 3 },
  { href: "/leads/new",          label: "Capture Lead",            icon: UserPlus,        release: 3 },
  { href: "/followups",          label: "Follow-Ups",              icon: Mail,            release: 9 },
  { href: "/crm-sync",           label: "CRM Sync",                icon: RefreshCw,       release: 10 },
  { href: "/opportunities",      label: "Opportunities",           icon: Briefcase,       release: 11 },
  { href: "/pipeline",           label: "Pipeline Board",          icon: Kanban,          release: 11 },
  { href: "/roi-analytics",      label: "ROI Analytics",           icon: BarChart2,       release: 12 },
  { href: "/workflows",          label: "Workflows",               icon: Workflow,        release: 13 },
  { href: "/agents",             label: "Agent Health",            icon: Bot,             release: 13 },
  { href: "/admin/tenants",      label: "Tenants",                 icon: Zap,             release: 2, roles: ["platform_admin"] },
  { href: "/admin/users",        label: "Users",                   icon: ShieldCheck,     release: 2, roles: ["platform_admin", "tenant_admin", "manager"] },
  { href: "/settings/tenant",    label: "Settings",                icon: Settings,        release: 2 },
];

export const CURRENT_RELEASE = 13;

// Priority items surfaced in the mobile bottom nav — matches the "Mobile
// Booth Usage" priorities: quick lead capture, lead list/score, follow-up.
export const MOBILE_PRIORITY_HREFS = ["/dashboard", "/leads", "/leads/new", "/followups"];
