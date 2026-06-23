import {
  LayoutDashboard, CalendarDays, Users, Brain, Building2, Star, Mail,
  RefreshCw, BarChart2, Settings, ShieldCheck, UserPlus, Zap, Briefcase, Kanban,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  release: number;
  roles?: string[];
}

export const NAV: NavItem[] = [
  { href: "/dashboard",          label: "Dashboard",               icon: LayoutDashboard, release: 1 },
  { href: "/events",             label: "Events",                  icon: CalendarDays,    release: 3 },
  { href: "/leads",              label: "Lead Intelligence",       icon: Users,           release: 3 },
  { href: "/leads/new",          label: "Capture Lead",            icon: UserPlus,        release: 3 },
  { href: "/conversation-intel", label: "Conversation Intelligence", icon: Brain,         release: 6 },
  { href: "/company-intel",      label: "Company Intelligence",    icon: Building2,       release: 7 },
  { href: "/lead-scoring",       label: "Lead Scoring",            icon: Star,            release: 8 },
  { href: "/followups",          label: "Follow-Ups",              icon: Mail,            release: 9 },
  { href: "/crm-sync",           label: "CRM Sync",                icon: RefreshCw,       release: 10 },
  { href: "/opportunities",      label: "Opportunities",           icon: Briefcase,       release: 11 },
  { href: "/pipeline",           label: "Pipeline Board",          icon: Kanban,          release: 11 },
  { href: "/roi-analytics",      label: "ROI Analytics",           icon: BarChart2,       release: 12 },
  { href: "/admin/tenants",      label: "Tenants",                 icon: Zap,             release: 2, roles: ["platform_admin"] },
  { href: "/admin/users",        label: "Users",                   icon: ShieldCheck,     release: 2, roles: ["platform_admin", "tenant_admin", "manager"] },
  { href: "/settings/tenant",    label: "Settings",                icon: Settings,        release: 2 },
];

export const CURRENT_RELEASE = 12;

// Priority items surfaced in the mobile bottom nav — matches the "Mobile
// Booth Usage" priorities: quick lead capture, lead list/score, follow-up.
export const MOBILE_PRIORITY_HREFS = ["/dashboard", "/leads", "/leads/new", "/followups"];
