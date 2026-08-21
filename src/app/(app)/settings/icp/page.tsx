import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/ui/PageHeader";
import { ICPListClient } from "./ICPListClient";

export default async function ICPConfigurationPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Release 14.3 — ICP administration is tenant_admin-only (not platform_admin,
  // not manager) per the R14.3 approval: "keeps ICP ownership clear."
  if (session.user.role !== "tenant_admin" || !session.user.tenantId) {
    return (
      <div className="space-y-6">
        <PageHeader title="ICP Configuration" description="Tenant administrator access only" />
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-5 sm:p-6 text-sm text-[#475569]">
          Configurable ICP is managed by your tenant administrator.
        </div>
      </div>
    );
  }

  const tenantId = session.user.tenantId;

  const [profiles, [tenant]] = await Promise.all([
    db.select().from(schema.icpProfiles).where(eq(schema.icpProfiles.tenantId, tenantId)).orderBy(desc(schema.icpProfiles.updatedAt)),
    db.select({ defaultIcpProfileId: schema.tenants.defaultIcpProfileId }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="ICP Configuration"
        description="Define who your Ideal Customer Profile is — scoring and follow-up will become ICP-aware in a later release, but this is where it starts."
      />
      <ICPListClient
        initialProfiles={profiles}
        defaultIcpProfileId={tenant?.defaultIcpProfileId ?? null}
      />
    </div>
  );
}
