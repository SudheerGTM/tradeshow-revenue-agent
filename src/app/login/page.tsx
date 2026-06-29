"use client";

import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Zap,
  Sparkles,
  RefreshCw,
  BarChart3,
  ShieldCheck,
  Users,
  Clock,
  Target,
  Bot,
} from "lucide-react";

const LOGO_SRC = "/GTM_AI_logo.jpeg";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const res = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError(
          res.code === "tenant_not_found"
            ? "We couldn't find a workspace for this URL. Check the link or contact your administrator."
            : "Invalid email or password."
        );
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("We couldn't reach the authentication service. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen overflow-hidden grid grid-cols-1 lg:grid-cols-2 bg-white">
      {/* Left panel — brand + product story */}
      <div className="hidden lg:flex flex-col bg-slate-50 px-10 py-6 overflow-hidden h-full">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-3 shrink-0">
          <div className="relative w-40 h-20 shrink-0">
            <img
              src={LOGO_SRC}
              alt="Trade Show Revenue Agent logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="leading-tight">
            <p className="text-slate-900 font-bold text-base">Trade Show</p>
            <p className="text-slate-500 font-medium text-base -mt-1">Revenue Agent</p>
          </div>
        </div>

        {/* Eyebrow */}
        <span className="inline-flex items-center w-fit rounded-md bg-sky-100 text-sky-700 text-[10px] font-semibold tracking-wide px-2.5 py-1 mb-2.5 shrink-0">
          AI-POWERED REVENUE PLATFORM
        </span>

        {/* Headline */}
        <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-2 shrink-0">
          Turn trade show leads into revenue.
        </h1>
        <p className="text-slate-500 text-xs leading-relaxed max-w-md mb-3 shrink-0">
          Capture booth leads in seconds, enrich with AI, score, follow up, and
          sync to CRM. Measure event ROI and accelerate your pipeline.
        </p>

        {/* Dashboard preview */}
        <div className="w-full flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-lg mb-3">
          <img
            src="/demo_dashboard.png"
            alt="Dashboard Preview"
            className="w-full h-full object-cover object-top"
          />
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-3 shrink-0">
          <FeatureCard
            icon={<Zap className="w-4 h-4" />}
            title="Fast Lead Capture"
            description="Capture booth leads in seconds, on mobile"
          />
          <FeatureCard
            icon={<Sparkles className="w-4 h-4" />}
            title="AI Lead Scoring & Enrichment"
            description="Identify high-intent leads automatically"
          />
          <FeatureCard
            icon={<RefreshCw className="w-4 h-4" />}
            title="CRM Sync & Workflows"
            description="Keep data clean with automated sync"
          />
          <FeatureCard
            icon={<BarChart3 className="w-4 h-4" />}
            title="Event ROI Analytics"
            description="Measure pipeline and revenue impact"
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-25 shrink-0">
          <Stat icon={<Clock className="w-4 h-4" />} value="Seconds" label="Lead capture time" />
          <Stat icon={<Target className="w-4 h-4" />} value="Automated" label="CRM sync workflow" />
          <Stat icon={<Bot className="w-4 h-4" />} value="24/7" label="AI-powered enrichment" />
        </div>
      </div>

      {/* Right panel — sign-in form */}
      <div className="flex items-center justify-center px-6 py-4 bg-slate-50 lg:bg-white h-full overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile-only logo + value statement */}
          <div className="lg:hidden flex flex-col items-center mb-6 text-center">
            <div className="flex flex-col items-center mb-6 text-center">
              <img
                src={LOGO_SRC}
                alt="Trade Show Revenue Agent logo"
                className="w-48 h-auto mb-3 object-contain"
              />

              <h1 className="text-2xl font-bold text-slate-900">
                Trade Show Revenue Agent
              </h1>

              <p className="mt-2 text-sm text-slate-500 max-w-xs">
                Capture booth leads, score with AI, and sync to CRM — all in one place.
              </p>
            </div>
            <p className="text-slate-500 text-xs max-w-xs">
              Capture booth leads, score with AI, and sync to CRM — all in one place.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm px-7 py-6">
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold text-slate-900 mb-1">Welcome back</h2>
              <p className="text-sm text-slate-500">
                Sign in to continue to Trade Show Revenue Agent.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/30 focus:border-[#0F4C81] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0F4C81]/30 focus:border-[#0F4C81] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex justify-end -mt-1">
                <Link href="/forgot-password" className="text-sm text-[#0F4C81] hover:underline font-medium">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-[#0F4C81] hover:bg-[#0a3660] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500 mt-4">
              Received an invitation? Use the link in your email to activate your account.
            </p>

            <div className="flex items-center justify-between mt-5 px-1">
              <TrustBadge icon={<ShieldCheck className="w-4 h-4" />} label="Secure Authentication" />
              <TrustBadge icon={<Lock className="w-4 h-4" />} label="Encrypted Connection" />
              <TrustBadge icon={<Users className="w-4 h-4" />} label="Enterprise Access Controls" />
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            Protected by enterprise-grade authentication.
          </p>
          <p className="text-center text-xs text-slate-400 mt-1">
            © {new Date().getFullYear()} GTMTechSol. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-2.5">
      <div className="w-7 h-7 rounded-lg bg-sky-50 text-[#0F4C81] flex items-center justify-center mb-1.5">
        {icon}
      </div>
      <p className="text-xs font-semibold text-slate-900 leading-snug mb-0.5">{title}</p>
      <p className="text-[11px] text-slate-500 leading-snug">{description}</p>
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[#0F4C81]">{icon}</div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-slate-900">{value}</p>
        <p className="text-[11px] text-slate-500">{label}</p>
      </div>
    </div>
  );
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center w-1/3">
      <div className="text-slate-400">{icon}</div>
      <span className="text-[11px] text-slate-500 leading-tight">{label}</span>
    </div>
  );
}
