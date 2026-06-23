/**
 * Apollo.io enrichment helper — server-side only.
 * API key never reaches the browser.
 */

const APOLLO_BASE = "https://api.apollo.io/api/v1";

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY is not set");
  return key;
}

async function apolloPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("Apollo rate limit reached — please try again later");
  if (res.status === 401) throw new Error("Invalid Apollo API key");
  if (!res.ok) throw new Error(`Apollo API error: ${res.status} ${res.statusText}`);

  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApolloCompanyResult {
  apolloId: string | null;
  name: string | null;
  website: string | null;
  linkedinUrl: string | null;
  industry: string | null;
  subIndustry: string | null;
  employeeCount: string | null;
  employeeRange: string | null;
  annualRevenue: string | null;
  revenueRange: string | null;
  headquarters: string | null;
  foundedYear: string | null;
  description: string | null;
  confidence: number; // 0–100
}

export interface ApolloContactResult {
  apolloId: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string | null;
  seniority: string | null;
  department: string | null;
  jobFunction: string | null;
  confidence: number;
}

export interface EnrichLeadResult {
  company: ApolloCompanyResult | null;
  contact: ApolloContactResult | null;
  companyFound: boolean;
  contactFound: boolean;
}

// ─── searchCompany ────────────────────────────────────────────────────────────

export async function searchCompany(
  companyName: string,
  website?: string
): Promise<ApolloCompanyResult | null> {
  if (!companyName.trim()) return null;

  const body: Record<string, unknown> = { q_organization_name: companyName, page: 1, per_page: 1 };
  if (website) body.q_organization_domains = [cleanDomain(website)];

  const data = await apolloPost("/organizations/search", body) as {
    organizations?: ApolloOrg[];
  };

  const org = data.organizations?.[0];
  if (!org) return null;

  return mapOrg(org);
}

// ─── searchPerson ─────────────────────────────────────────────────────────────

export async function searchPerson(params: {
  firstName: string;
  lastName?: string;
  email?: string;
  companyName?: string;
  organizationId?: string;
}): Promise<ApolloContactResult | null> {
  if (!params.firstName && !params.email) return null;

  // Apollo's old /people/search endpoint is deprecated for API callers and
  // now always returns 422 — every contact search was silently failing
  // before this fix, independent of query quality. The current flow is two
  // calls: (1) /mixed_people/api_search to find a candidate (returns a
  // privacy-obfuscated result — partial last name, no LinkedIn), then
  // (2) /people/match with that id to reveal full details. Skipping step 2
  // would mean storing "Cr***z" as a contact's surname.
  //
  // Apollo also ANDs all filters together, so a hard email match combined
  // with name/company filters returns zero results if the email is wrong —
  // which is common for trade-show leads (reps often capture placeholder
  // emails like "test@test.com" on the show floor). Name + company is a
  // far more reliable signal here, so search on that first.
  //
  // Linking by organization_id (resolved from a prior company search) is
  // far more reliable than a free-text q_organization_name match — Apollo's
  // people index is keyed off the org's canonical ID, not an arbitrary name
  // string — so pass it whenever the caller has one.
  if (params.firstName) {
    const nameBody: Record<string, unknown> = {
      page: 1, per_page: 1,
      q_person_name: [params.firstName, params.lastName].filter(Boolean).join(" "),
    };
    if (params.organizationId) {
      nameBody.organization_ids = [params.organizationId];
    } else if (params.companyName) {
      nameBody.q_organization_name = params.companyName;
    }

    let candidate = await findPersonCandidate(nameBody);

    // If filtering by organization returned nothing, retry on name alone —
    // the org filter may be too strict (e.g. subsidiary/trading name mismatch).
    if (!candidate && (params.organizationId || params.companyName)) {
      candidate = await findPersonCandidate({
        page: 1, per_page: 1,
        q_person_name: [params.firstName, params.lastName].filter(Boolean).join(" "),
      });
    }

    if (candidate) {
      const full = await matchPerson(candidate.id);
      if (full) return mapPerson(full);
    }
  }

  if (params.email && isLikelyRealEmail(params.email)) {
    const candidate = await findPersonCandidate({ page: 1, per_page: 1, q_emails: [params.email] });
    if (candidate) {
      const full = await matchPerson(candidate.id);
      if (full) return mapPerson(full);
    }
  }

  return null;
}

// Step 1: search (lightweight, privacy-obfuscated results, no credit cost)
async function findPersonCandidate(body: Record<string, unknown>): Promise<{ id: string } | null> {
  const data = await apolloPost("/mixed_people/api_search", body) as { people?: { id?: string }[] };
  const person = data.people?.[0];
  return person?.id ? { id: person.id } : null;
}

// Step 2: match (full enrichment — name, LinkedIn, seniority, etc.)
async function matchPerson(id: string): Promise<ApolloPerson | null> {
  const data = await apolloPost("/people/match", { id }) as { person?: ApolloPerson };
  return data.person ?? null;
}

// Filters out obvious placeholder/test addresses captured on the show floor
// (test@test.com, n/a@x.com, etc.) so they don't get used as a search filter.
function isLikelyRealEmail(email: string): boolean {
  const lower = email.toLowerCase();
  const junkPatterns = ["test@", "@test.com", "n/a", "example.com", "noemail", "none@", "fake@"];
  return !junkPatterns.some(p => lower.includes(p));
}

// ─── enrichLead ───────────────────────────────────────────────────────────────

export async function enrichLead(lead: {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  companyName: string;
  website?: string | null;
}): Promise<EnrichLeadResult> {
  // Company search runs first (not in parallel) so its resolved Apollo
  // organization ID can be used to scope the person search — matching by
  // org ID is far more reliable than a free-text company name on
  // /people/search, which is keyed off canonical organization records.
  const company = await settle(searchCompany(lead.companyName, lead.website ?? undefined));

  const contact = await settle(searchPerson({
    firstName: lead.firstName,
    lastName: lead.lastName ?? undefined,
    email: lead.email ?? undefined,
    companyName: lead.companyName,
    organizationId: company.status === "fulfilled" ? company.value?.apolloId ?? undefined : undefined,
  }));

  const companyResult = company.status === "fulfilled" ? company.value : null;
  const contactResult = contact.status === "fulfilled" ? contact.value : null;

  // Surface errors from settled promises as partial results
  if (company.status === "rejected") console.error("Company enrichment failed:", company.reason);
  if (contact.status === "rejected") console.error("Contact enrichment failed:", contact.reason);

  return {
    company: companyResult,
    contact: contactResult,
    companyFound: !!companyResult,
    contactFound: !!contactResult,
  };
}

// ─── Internal mappers ─────────────────────────────────────────────────────────

interface ApolloOrg {
  id?: string;
  name?: string;
  website_url?: string;
  linkedin_url?: string;
  industry?: string;
  keywords?: string[];
  estimated_num_employees?: number;
  employee_count?: number;
  raw_address?: string;
  city?: string;
  state?: string;
  country?: string;
  founded_year?: number;
  short_description?: string;
  annual_revenue?: number;
  annual_revenue_printed?: string;
}

interface ApolloPerson {
  id?: string;
  first_name?: string;
  last_name?: string;
  linkedin_url?: string;
  seniority?: string;
  departments?: string[];
  functions?: string[];
  title?: string;
}

function mapOrg(org: ApolloOrg): ApolloCompanyResult {
  const empCount = org.estimated_num_employees ?? org.employee_count;
  return {
    apolloId: org.id ?? null,
    name: org.name ?? null,
    website: org.website_url ?? null,
    linkedinUrl: org.linkedin_url ?? null,
    industry: org.industry ?? null,
    subIndustry: org.keywords?.[0] ?? null,
    employeeCount: empCount ? String(empCount) : null,
    employeeRange: empCount ? toEmployeeRange(empCount) : null,
    annualRevenue: org.annual_revenue_printed ?? (org.annual_revenue ? `$${org.annual_revenue.toLocaleString()}` : null),
    revenueRange: org.annual_revenue ? toRevenueRange(org.annual_revenue) : null,
    headquarters: [org.city, org.state, org.country].filter(Boolean).join(", ") || org.raw_address || null,
    foundedYear: org.founded_year ? String(org.founded_year) : null,
    description: org.short_description ?? null,
    confidence: org.name ? 85 : 50,
  };
}

function mapPerson(p: ApolloPerson): ApolloContactResult {
  return {
    apolloId: p.id ?? null,
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    linkedinUrl: p.linkedin_url ?? null,
    seniority: p.seniority ?? null,
    department: p.departments?.[0] ?? null,
    jobFunction: p.functions?.[0] ?? p.title ?? null,
    confidence: p.id ? 80 : 40,
  };
}

function toEmployeeRange(n: number): string {
  if (n < 10) return "1–9";
  if (n < 50) return "10–49";
  if (n < 200) return "50–199";
  if (n < 500) return "200–499";
  if (n < 1000) return "500–999";
  if (n < 5000) return "1,000–4,999";
  if (n < 10000) return "5,000–9,999";
  return "10,000+";
}

function toRevenueRange(n: number): string {
  if (n < 1_000_000) return "< $1M";
  if (n < 10_000_000) return "$1M–$10M";
  if (n < 50_000_000) return "$10M–$50M";
  if (n < 100_000_000) return "$50M–$100M";
  if (n < 500_000_000) return "$100M–$500M";
  if (n < 1_000_000_000) return "$500M–$1B";
  return "$1B+";
}

function cleanDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
}

// Wraps a single promise in the same { status, value | reason } shape
// Promise.allSettled produces, so error handling stays consistent even
// though company/contact lookups now run sequentially instead of in parallel.
async function settle<T>(promise: Promise<T>): Promise<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }> {
  try {
    const value = await promise;
    return { status: "fulfilled", value };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}
