/**
 * HubSpot CRM integration — server-side only.
 * Access token never reaches the browser.
 *
 * All write operations (createContact/createCompany/createDeal/createTask)
 * are only ever invoked from the CRM Sync Agent AFTER a human has approved
 * the sync. Nothing in this module is called automatically.
 */

const HUBSPOT_BASE = "https://api.hubapi.com";

function getAccessToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  return token;
}

async function hubspotRequest(method: "GET" | "POST" | "PATCH", path: string, body?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) throw new Error("Invalid or expired HubSpot access token");
  if (res.status === 429) throw new Error("HubSpot rate limit reached — please try again later");
  if (res.status === 404) return null;
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.message ?? "";
    } catch {
      // ignore parse failure
    }
    throw new Error(`HubSpot API error: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HubspotContactInput {
  email?: string;
  firstname: string;
  lastname?: string;
  jobtitle?: string;
  phone?: string;
  company?: string;
}

export interface HubspotCompanyInput {
  name: string;
  domain?: string;
  industry?: string;
  numberofemployees?: string;
  city?: string;
}

export interface HubspotDealInput {
  dealname: string;
  amount?: number;
  pipeline?: string;
  dealstage?: string;
  description?: string;
  contactId?: string;
  companyId?: string;
}

export interface HubspotTaskInput {
  subject: string;
  body: string;
  dueDate?: Date;
  contactId?: string;
}

export interface HubspotRecordResult {
  id: string;
  raw: unknown;
}

// ─── Search (duplicate detection) ──────────────────────────────────────────

export async function searchExistingContact(email?: string): Promise<HubspotRecordResult | null> {
  if (!email) return null;

  const result = await hubspotRequest("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
    properties: ["email", "firstname", "lastname", "company"],
    limit: 1,
  }) as { results?: { id: string }[] } | null;

  if (!result?.results?.length) return null;
  return { id: result.results[0].id, raw: result.results[0] };
}

export async function searchExistingCompany(companyName?: string, domain?: string): Promise<HubspotRecordResult | null> {
  if (!companyName && !domain) return null;

  const filters = domain
    ? [{ propertyName: "domain", operator: "EQ", value: domain }]
    : [{ propertyName: "name", operator: "EQ", value: companyName }];

  const result = await hubspotRequest("POST", "/crm/v3/objects/companies/search", {
    filterGroups: [{ filters }],
    properties: ["name", "domain", "industry"],
    limit: 1,
  }) as { results?: { id: string }[] } | null;

  if (!result?.results?.length) return null;
  return { id: result.results[0].id, raw: result.results[0] };
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createContact(input: HubspotContactInput): Promise<HubspotRecordResult> {
  const properties: Record<string, string> = {
    firstname: input.firstname,
  };
  if (input.lastname) properties.lastname = input.lastname;
  if (input.email) properties.email = input.email;
  if (input.jobtitle) properties.jobtitle = input.jobtitle;
  if (input.phone) properties.phone = input.phone;
  if (input.company) properties.company = input.company;

  const result = await hubspotRequest("POST", "/crm/v3/objects/contacts", { properties }) as { id: string };
  return { id: result.id, raw: result };
}

export async function createCompany(input: HubspotCompanyInput): Promise<HubspotRecordResult> {
  const properties: Record<string, string> = { name: input.name };
  if (input.domain) properties.domain = input.domain;
  if (input.industry) properties.industry = input.industry;
  if (input.numberofemployees) properties.numberofemployees = input.numberofemployees;
  if (input.city) properties.city = input.city;

  const result = await hubspotRequest("POST", "/crm/v3/objects/companies", { properties }) as { id: string };
  return { id: result.id, raw: result };
}

export async function createDeal(input: HubspotDealInput): Promise<HubspotRecordResult> {
  const pipeline = input.pipeline ?? process.env.HUBSPOT_PIPELINE_ID;
  const dealstage = input.dealstage ?? process.env.HUBSPOT_STAGE_ID;

  const properties: Record<string, string> = { dealname: input.dealname };
  if (input.amount != null) properties.amount = String(input.amount);
  if (pipeline) properties.pipeline = pipeline;
  if (dealstage) properties.dealstage = dealstage;
  if (input.description) properties.description = input.description;

  const associations = [];
  if (input.contactId) {
    associations.push({
      to: { id: input.contactId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
    });
  }
  if (input.companyId) {
    associations.push({
      to: { id: input.companyId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }],
    });
  }

  const body: Record<string, unknown> = { properties };
  if (associations.length) body.associations = associations;

  const result = await hubspotRequest("POST", "/crm/v3/objects/deals", body) as { id: string };
  return { id: result.id, raw: result };
}

export async function createTask(input: HubspotTaskInput): Promise<HubspotRecordResult> {
  const properties: Record<string, string> = {
    hs_task_subject: input.subject,
    hs_task_body: input.body,
    hs_task_status: "NOT_STARTED",
    hs_task_type: "TODO",
  };
  if (input.dueDate) properties.hs_timestamp = String(input.dueDate.getTime());

  const body: Record<string, unknown> = { properties };

  if (input.contactId) {
    body.associations = [{
      to: { id: input.contactId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }],
    }];
  }

  const result = await hubspotRequest("POST", "/crm/v3/objects/tasks", body) as { id: string };
  return { id: result.id, raw: result };
}
