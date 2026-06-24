import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { WelcomeWizard } from "./WelcomeWizard";

export default async function WelcomePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [user] = await db
    .select({ onboardingStep: schema.users.onboardingStep, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id!))
    .limit(1);

  return <WelcomeWizard initialStep={user?.onboardingStep ?? 0} firstName={(user?.name ?? "there").split(" ")[0]} />;
}
