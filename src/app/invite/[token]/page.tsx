import { db, schema } from "@/db";
import { eq, and, gt } from "drizzle-orm";
import { getTenantById } from "@/lib/tenant";
import { AcceptInviteForm } from "./AcceptInviteForm";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const rows = await db
    .select()
    .from(schema.userInvitations)
    .where(
      and(
        eq(schema.userInvitations.invitationToken, token),
        eq(schema.userInvitations.status, "pending"),
        gt(schema.userInvitations.expiresAt, new Date())
      )
    )
    .limit(1);

  const invitation = rows[0];
  const tenant = invitation ? await getTenantById(invitation.tenantId) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">TS</span>
            </div>
            <span className="text-white font-semibold text-lg">TradeShow Agent</span>
          </div>
          <p className="text-gray-400 text-sm">
            {invitation ? `Join ${tenant?.name ?? "your team"}` : "Invitation"}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {invitation ? (
            <AcceptInviteForm
              token={token}
              email={invitation.email}
              firstName={invitation.firstName}
            />
          ) : (
            <div className="text-center space-y-2">
              <p className="text-white font-medium">This invitation link is invalid or has expired.</p>
              <p className="text-gray-400 text-sm">Ask your tenant administrator to resend it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
