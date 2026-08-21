import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getICPProfile, getICPConfiguration } from "@/lib/icp/icp-resolver";
import { PageHeader } from "@/components/ui/PageHeader";
import { ICPEditClient } from "./ICPEditClient";

export default async function ICPProfileEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "tenant_admin" || !session.user.tenantId) {
    redirect("/settings/icp");
  }

  const { id } = await params;
  const tenantId = session.user.tenantId;

  const profile = await getICPProfile(tenantId, id);
  if (!profile) notFound();

  const [tenant] = await db.select({ defaultIcpProfileId: schema.tenants.defaultIcpProfileId }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title={profile.name} description="Company Fit, Persona Fit, Problem Fit, Buying Signals, and Products" />
      <ICPEditClient
        profile={profile}
        config={getICPConfiguration(profile)}
        isDefault={tenant?.defaultIcpProfileId === profile.id}
      />
    </div>
  );
}
