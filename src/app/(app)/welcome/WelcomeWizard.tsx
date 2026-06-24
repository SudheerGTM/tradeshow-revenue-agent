"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, LayoutDashboard, UserCircle, IdCard, BarChart3, ArrowRight, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

const STEPS = [
  { title: "Welcome", icon: Sparkles },
  { title: "Platform Overview", icon: LayoutDashboard },
  { title: "Complete Profile", icon: UserCircle },
  { title: "Create First Lead", icon: IdCard },
  { title: "Explore Dashboard", icon: BarChart3 },
];

export function WelcomeWizard({ initialStep, firstName }: { initialStep: number; firstName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(initialStep, STEPS.length - 1));

  async function persistStep(n: number) {
    await fetch("/api/users/me/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: n }),
    }).catch(() => {});
  }

  async function handleNext() {
    const next = step + 1;
    if (next >= STEPS.length) {
      await persistStep(STEPS.length);
      router.push("/dashboard");
      return;
    }
    await persistStep(next);
    setStep(next);
  }

  async function handleSkip() {
    await persistStep(STEPS.length);
    router.push("/dashboard");
  }

  const completionPct = Math.round((step / (STEPS.length - 1)) * 100);
  const StepIcon = STEPS[step].icon;

  return (
    <div className="max-w-xl mx-auto space-y-6 py-6">
      {/* Progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.title} className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-[#0F4C81]" : "bg-[#E2E8F0]"}`} />
        ))}
      </div>
      <p className="text-xs text-[#94A3B8] text-right">{completionPct}% complete</p>

      <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-sm p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[#0F4C81] flex items-center justify-center mx-auto">
          <StepIcon className="w-8 h-8 text-white" />
        </div>

        {step === 0 && (
          <>
            <h1 className="text-xl font-bold text-[#0F172A]">Welcome, {firstName}!</h1>
            <p className="text-sm text-[#475569]">
              Let&apos;s get you set up in under a minute. Trade Show Revenue Agent turns booth conversations into pipeline — scan badges, capture leads, and let AI handle the follow-up busywork.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <h1 className="text-xl font-bold text-[#0F172A]">Platform Overview</h1>
            <p className="text-sm text-[#475569]">
              Your Dashboard tracks every lead from capture to close. Quick Capture lets your booth team scan badges or business cards instead of typing. Lead Scoring, Follow-Ups, and CRM Sync run automatically behind the scenes.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="text-xl font-bold text-[#0F172A]">Complete Your Profile</h1>
            <p className="text-sm text-[#475569]">
              Add a profile photo and double-check your name on your Profile page — it helps your team recognize who captured which lead.
            </p>
            <Button variant="secondary" onClick={() => router.push("/profile")}>Go to Profile</Button>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="text-xl font-bold text-[#0F172A]">Create Your First Lead</h1>
            <p className="text-sm text-[#475569]">
              Try out Quick Capture — scan a badge QR code or business card, or just enter details manually.
            </p>
            <Button variant="secondary" onClick={() => router.push("/leads/new")}>Capture a Lead</Button>
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="text-xl font-bold text-[#0F172A]">Explore Your Dashboard</h1>
            <p className="text-sm text-[#475569]">
              That&apos;s it — you&apos;re ready. Your Dashboard will fill up as your team captures leads at the show.
            </p>
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          </>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={handleSkip} className="text-xs text-[#94A3B8] hover:text-[#475569] transition">Skip for now</button>
          <Button onClick={handleNext}>
            {step === STEPS.length - 1 ? "Go to Dashboard" : "Continue"} <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
