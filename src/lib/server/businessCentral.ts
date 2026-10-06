import { createHash } from "crypto";

type BusinessCentralConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  environment: string;
  companyName: string;
};

type Company = {
  id: string;
  name?: string;
  displayName?: string;
};

type ODataResponse<T> = {
  value?: T[];
  "@odata.count"?: number;
};

export type BusinessCentralEndpointProbe = {
  endpoint: string;
  available: boolean;
  status: number;
  recordCount: number | null;
  fields: string[];
};

export type BusinessCentralConnectionResult = {
  connected: true;
  environment: string;
  company: { id: string; name: string };
  availableCompanies: string[];
  endpoints: BusinessCentralEndpointProbe[];
  odataItemLedger: BusinessCentralEndpointProbe;
  itemLedgerDateRange: { earliest: string | null; latest: string | null };
  recent90DayLedger: {
    from: string | null;
    to: string | null;
    recordCount: number | null;
  };
  testedAt: string;
  connectionKey: string;
};

let tokenCache: { value: string; expiresAt: number } | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`BC_CONFIG_MISSING_${name}`);
  return value;
}

export function businessCentralConfig(): BusinessCentralConfig {
  return {
    tenantId: required("BC_TENANT_ID"),
    clientId: required("BC_CLIENT_ID"),
    clientSecret: required("BC_CLIENT_SECRET"),
    environment: required("BC_ENVIRONMENT"),
    companyName: required("BC_COMPANY_NAME"),
  };
}

export function businessCentralConnectionKey(
  config: Pick<
    BusinessCentralConfig,
    "tenantId" | "clientId"
  > = businessCentralConfig(),
): string {
  return createHash("sha256")
    .update(`${config.tenantId}|${config.clientId}`)
    .digest("hex");
}

async function accessToken(config: BusinessCentralConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000)
    return tokenCache.value;
  const form = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://api.businesscentral.dynamics.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`BC_OAUTH_FAILED_${response.status}`);
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) throw new Error("BC_OAUTH_TOKEN_MISSING");
  tokenCache = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 300) * 1000,
  };
  return tokenCache.value;
}

function apiBase(config: BusinessCentralConfig, environment: string): string {
  return `https://api.businesscentral.dynamics.com/v2.0/${encodeURIComponent(config.tenantId)}/${encodeURIComponent(environment)}/api/v2.0`;
}

function odataCompanyBase(
  config: BusinessCentralConfig,
  environment: string,
  companyId: string,
): string {
  return `https://api.businesscentral.dynamics.com/v2.0/${encodeURIComponent(config.tenantId)}/${encodeURIComponent(environment)}/ODataV4/Company(Id=${companyId})`;
}

async function getJson<T>(
  url: string,
  token: string,
): Promise<{
  status: number;
  ok: boolean;
  body: T | null;
  errorCode: string | null;
}> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    (T & { error?: { code?: string } }) | null;
  return {
    status: response.status,
    ok: response.ok,
    body,
    errorCode: body?.error?.code ?? null,
  };
}

function companyName(company: Company): string {
  return (company.displayName || company.name || "").trim();
}

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function selectBusinessCentralCompany(
  companies: Company[],
  requestedName: string,
): Company | null {
  const expected = normalized(requestedName);
  return (
    companies.find(
      (company) =>
        normalized(company.name ?? "") === expected ||
        normalized(company.displayName ?? "") === expected,
    ) ?? null
  );
}

async function findEnvironmentAndCompany(
  config: BusinessCentralConfig,
  token: string,
): Promise<{
  environment: string;
  base: string;
  company: Company;
  companies: Company[];
}> {
  const candidates = [
    ...new Set([config.environment, "Production", "Sandbox"].filter(Boolean)),
  ];
  const available: { environment: string; companies: Company[] }[] = [];
  for (const environment of candidates) {
    const base = apiBase(config, environment);
    const response = await getJson<ODataResponse<Company>>(
      `${base}/companies`,
      token,
    );
    if (!response.ok) continue;
    const companies = response.body?.value ?? [];
    const company = selectBusinessCentralCompany(companies, config.companyName);
    if (company) return { environment, base, company, companies };
    available.push({ environment, companies });
  }
  if (available.length)
    throw new Error(
      `BC_COMPANY_NOT_FOUND_${available
        .flatMap((entry) => entry.companies.map(companyName))
        .filter(Boolean)
        .join("|")}`,
    );
  throw new Error("BC_ENVIRONMENT_NOT_FOUND_OR_FORBIDDEN");
}

async function probeEndpoint(
  base: string,
  companyId: string,
  endpoint: string,
  token: string,
): Promise<BusinessCentralEndpointProbe> {
  const root = `${base}/companies(${companyId})/${endpoint}`;
  let response = await getJson<ODataResponse<Record<string, unknown>>>(
    `${root}?$top=1&$count=true`,
    token,
  );
  if (!response.ok)
    response = await getJson<ODataResponse<Record<string, unknown>>>(
      `${root}?$top=1`,
      token,
    );
  const first = response.body?.value?.[0];
  return {
    endpoint,
    available: response.ok,
    status: response.status,
    recordCount:
      typeof response.body?.["@odata.count"] === "number"
        ? response.body["@odata.count"]
        : null,
    fields: first
      ? Object.keys(first).filter((field) => !field.startsWith("@odata."))
      : [],
  };
}

async function probeODataItemLedger(
  config: BusinessCentralConfig,
  environment: string,
  companyId: string,
  token: string,
): Promise<BusinessCentralEndpointProbe> {
  const response = await getJson<ODataResponse<Record<string, unknown>>>(
    `${odataCompanyBase(config, environment, companyId)}/ItemLedgerEntries?$top=1&$count=true`,
    token,
  );
  const first = response.body?.value?.[0];
  return {
    endpoint: "ODataV4/ItemLedgerEntries",
    available: response.ok,
    status: response.status,
    recordCount:
      typeof response.body?.["@odata.count"] === "number"
        ? response.body["@odata.count"]
        : null,
    fields: first
      ? Object.keys(first).filter((field) => !field.startsWith("@odata."))
      : [],
  };
}

async function ledgerDate(
  base: string,
  companyId: string,
  token: string,
  direction: "asc" | "desc",
): Promise<string | null> {
  const response = await getJson<ODataResponse<{ postingDate?: string }>>(
    `${base}/companies(${companyId})/itemLedgerEntries?$select=postingDate&$orderby=postingDate%20${direction}&$top=1`,
    token,
  );
  return response.ok ? (response.body?.value?.[0]?.postingDate ?? null) : null;
}

function subtractDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

async function recentLedgerWindow(
  base: string,
  companyId: string,
  token: string,
  latest: string | null,
): Promise<BusinessCentralConnectionResult["recent90DayLedger"]> {
  if (!latest) return { from: null, to: null, recordCount: null };
  const from = subtractDays(latest, 89);
  const filter = encodeURIComponent(
    `postingDate ge ${from} and postingDate le ${latest}`,
  );
  const response = await getJson<ODataResponse<Record<string, unknown>>>(
    `${base}/companies(${companyId})/itemLedgerEntries?$select=id&$filter=${filter}&$top=1&$count=true`,
    token,
  );
  return {
    from,
    to: latest,
    recordCount:
      response.ok && typeof response.body?.["@odata.count"] === "number"
        ? response.body["@odata.count"]
        : null,
  };
}

export async function testBusinessCentralConnection(): Promise<BusinessCentralConnectionResult> {
  const config = businessCentralConfig();
  const token = await accessToken(config);
  const found = await findEnvironmentAndCompany(config, token);
  const companyId = found.company.id;
  const [endpoints, odataItemLedger, earliest, latest] = await Promise.all([
    Promise.all(
      [
        "items",
        "itemLedgerEntries",
        "locations",
        "salesOrders",
        "purchaseOrders",
        "itemVariants",
      ].map((endpoint) =>
        probeEndpoint(found.base, companyId, endpoint, token),
      ),
    ),
    probeODataItemLedger(config, found.environment, companyId, token),
    ledgerDate(found.base, companyId, token, "asc"),
    ledgerDate(found.base, companyId, token, "desc"),
  ]);
  const recent90DayLedger = await recentLedgerWindow(
    found.base,
    companyId,
    token,
    latest,
  );
  return {
    connected: true,
    environment: found.environment,
    company: { id: companyId, name: companyName(found.company) },
    availableCompanies: found.companies.map(companyName).filter(Boolean),
    endpoints,
    odataItemLedger,
    itemLedgerDateRange: { earliest, latest },
    recent90DayLedger,
    testedAt: new Date().toISOString(),
    connectionKey: businessCentralConnectionKey(config),
  };
}
