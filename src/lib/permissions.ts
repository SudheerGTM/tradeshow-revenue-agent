import type { UserRole } from "@/db/schema";

// Role hierarchy (higher index = more privilege)
const ROLE_RANK: Record<UserRole, number> = {
  platform_admin: 4,
  tenant_admin:   3,
  manager:        2,
  booth_user:     1,
};

export function hasRole(userRole: string, required: UserRole): boolean {
  return (ROLE_RANK[userRole as UserRole] ?? 0) >= ROLE_RANK[required];
}

export function isPlatformAdmin(role: string) { return role === "platform_admin"; }
export function isTenantAdmin(role: string)   { return hasRole(role, "tenant_admin"); }
export function isManager(role: string)        { return hasRole(role, "manager"); }

/** Roles that can create a user of a given role */
export function canAssignRole(actorRole: string, targetRole: UserRole): boolean {
  if (actorRole === "platform_admin") return true;
  if (actorRole === "tenant_admin") {
    return targetRole === "manager" || targetRole === "booth_user";
  }
  return false;
}

/** Roles allowed to visit /admin/* */
export const ADMIN_ROLES: UserRole[] = ["platform_admin", "tenant_admin", "manager"];
