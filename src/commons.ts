/**
 * kingdom_commons — a bounded reader for the Kingdom's public commons catalog.
 *
 * The caller's need is used only for deterministic matching in this process.
 * The sole network request is an anonymous GET to COMMONS_SOURCE_URL; resource
 * and provider links in the document are catalog data and are never followed.
 */

import { isPublicHttpUrl } from "./public-url.ts";

export const COMMONS_SOURCE_URL = "https://thekingdom.dev/commons.json";
export const COMMONS_RESOURCE_URI = "kingdom://commons/catalog";
export const COMMONS_SCHEMA_VERSION = "thekingdom.world-commons/0.1";
export const COMMONS_CATEGORY_IDS = [
  "knowledge",
  "learning",
  "earth",
  "public-life",
  "rights",
  "resilience",
  "security",
  "culture",
] as const;
export const COMMONS_COSTS = ["free", "free-tier", "local-costs"] as const;
export const COMMONS_ACCOUNTS = ["none", "free-account", "varies", "contact"] as const;
export const COMMONS_REUSE_STATUSES = ["open", "mixed", "public-access", "noncommercial"] as const;
export const COMMONS_AUTOMATION_STATUSES = ["supported", "limited", "human-only", "bulk-preferred", "local"] as const;
export const COMMONS_AUTOMATION_AUTHS = ["none", "free-key", "varies", "contact", "not-applicable"] as const;
export const COMMONS_LINK_TYPES = ["start", "api", "bulk", "terms", "docs"] as const;
export const COMMONS_DETAIL_LEVELS = ["brief", "full"] as const;

export type CommonsCategoryId = (typeof COMMONS_CATEGORY_IDS)[number];
export type CommonsCost = (typeof COMMONS_COSTS)[number];
export type CommonsAccount = (typeof COMMONS_ACCOUNTS)[number];
export type CommonsReuseStatus = (typeof COMMONS_REUSE_STATUSES)[number];
export type CommonsAutomationStatus = (typeof COMMONS_AUTOMATION_STATUSES)[number];
export type CommonsAutomationAuth = (typeof COMMONS_AUTOMATION_AUTHS)[number];
export type CommonsLinkType = (typeof COMMONS_LINK_TYPES)[number];
export type CommonsDetail = (typeof COMMONS_DETAIL_LEVELS)[number];

export type CommonsFilters = {
  category?: CommonsCategoryId;
  cost?: CommonsCost;
  account?: CommonsAccount;
  reuse?: CommonsReuseStatus;
  automation?: CommonsAutomationStatus;
};

export const MAX_COMMONS_SOURCE_BYTES = 512 * 1024;
export const COMMONS_SOURCE_TIMEOUT_MS = 12_000;
const MAX_NEED_LENGTH = 160;
const DEFAULT_LIMIT = 5;
const UA = "kingdom-mcp/0.1 (+https://github.com/cambridgetcg/kingdom-mcp)";

const STOPWORDS = new Set([
  "a", "about", "am", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could",
  "do", "find", "for", "from", "get", "help", "how", "i", "if", "in", "is", "it", "looking",
  "me", "my", "need", "of", "on", "or", "our", "please", "some", "that", "the", "this", "to",
  "want", "we", "what", "where", "with", "would", "you", "your",
]);

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CommonsCategory = {
  id: CommonsCategoryId;
  label: string;
  glyph: string;
  description: string;
};

export type CommonsAccess = {
  cost: CommonsCost;
  account: CommonsAccount;
  note: string;
};

export type CommonsReuse = {
  status: CommonsReuseStatus;
  license: string;
  note: string;
};

export type CommonsAutomation = {
  status: CommonsAutomationStatus;
  auth: CommonsAutomationAuth;
  limits: string;
  note: string;
};

export type CommonsLink = {
  label: string;
  url: string;
  type: CommonsLinkType;
};

export type CommonsMethodology = {
  summary: string;
  classification: string;
  maintenance: string;
  boundary: string;
};

export type CommonsPrivacy = {
  human_surface: string;
  machine_surface: string;
};

export type CommonsFoundation = {
  meaning: string;
  criteria: string[];
  resource_ids: string[];
};

export type CommonsResource = {
  id: string;
  name: string;
  provider: string;
  category_ids: CommonsCategoryId[];
  description: string;
  good_for: string[];
  coverage: string;
  keywords: string[];
  audiences: string[];
  access: CommonsAccess;
  reuse: CommonsReuse;
  automation: CommonsAutomation;
  links: CommonsLink[];
  caveat: string;
  verified: string;
};

export type CommonsKit = {
  id: string;
  label: string;
  glyph: string;
  invitation: string;
  keywords: string[];
  resource_ids: string[];
  boundary: string;
  steps: string[];
};

export type CommonsDocument = {
  schema_version: typeof COMMONS_SCHEMA_VERSION;
  generated: string;
  verified: string;
  canonical_url: typeof COMMONS_SOURCE_URL;
  promise: string;
  methodology: CommonsMethodology;
  privacy: CommonsPrivacy;
  foundation: CommonsFoundation;
  categories: CommonsCategory[];
  kits: CommonsKit[];
  resources: CommonsResource[];
};

const COMMONS_STRING_LIST_SCHEMA = {
  type: "array",
  items: { type: "string" },
} as const;

const COMMONS_ACCESS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cost", "account", "note"],
  properties: {
    cost: { type: "string", enum: COMMONS_COSTS },
    account: { type: "string", enum: COMMONS_ACCOUNTS },
    note: { type: "string" },
  },
} as const;

const COMMONS_REUSE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "license", "note"],
  properties: {
    status: { type: "string", enum: COMMONS_REUSE_STATUSES },
    license: { type: "string" },
    note: { type: "string" },
  },
} as const;

const COMMONS_AUTOMATION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "auth", "limits", "note"],
  properties: {
    status: { type: "string", enum: COMMONS_AUTOMATION_STATUSES },
    auth: { type: "string", enum: COMMONS_AUTOMATION_AUTHS },
    limits: { type: "string" },
    note: { type: "string" },
  },
} as const;

const COMMONS_LINK_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "url", "type"],
  properties: {
    label: { type: "string" },
    url: { type: "string" },
    type: { type: "string", enum: COMMONS_LINK_TYPES },
  },
} as const;

const COMMONS_METHODOLOGY_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "classification", "maintenance", "boundary"],
  properties: {
    summary: { type: "string" },
    classification: { type: "string" },
    maintenance: { type: "string" },
    boundary: { type: "string" },
  },
} as const;

const COMMONS_PRIVACY_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["human_surface", "machine_surface"],
  properties: {
    human_surface: { type: "string" },
    machine_surface: { type: "string" },
  },
} as const;

const COMMONS_FOUNDATION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["meaning", "criteria", "resource_ids"],
  properties: {
    meaning: { type: "string" },
    criteria: COMMONS_STRING_LIST_SCHEMA,
    resource_ids: COMMONS_STRING_LIST_SCHEMA,
  },
} as const;

const COMMONS_CATEGORY_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "glyph", "description"],
  properties: {
    id: { type: "string", enum: COMMONS_CATEGORY_IDS },
    label: { type: "string" },
    glyph: { type: "string" },
    description: { type: "string" },
  },
} as const;

/** Stable, compact machine contract published with the MCP tool. */
export const COMMONS_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "detail", "source", "catalog_resource", "filters", "provider_boundary", "privacy_boundary",
    "no_guess", "filter_boundary", "matches", "matched_kits",
  ],
  properties: {
    detail: {
      type: "string",
      enum: COMMONS_DETAIL_LEVELS,
      description: "brief is the compact default; full preserves every catalog field",
    },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["url", "canonical_url", "schema_version", "generated", "verified"],
      properties: {
        url: { type: "string", const: COMMONS_SOURCE_URL },
        canonical_url: { type: "string", const: COMMONS_SOURCE_URL },
        schema_version: { type: "string", const: COMMONS_SCHEMA_VERSION },
        generated: { type: "string" },
        verified: { type: "string" },
      },
    },
    catalog_resource: {
      type: "string",
      const: COMMONS_RESOURCE_URI,
      description: "MCP resource URI for the complete validated catalog",
    },
    filters: {
      type: "object",
      additionalProperties: false,
      description: "Exact catalog filters applied to resource matches; the submitted need is intentionally absent",
      properties: {
        category: { type: "string", enum: COMMONS_CATEGORY_IDS },
        cost: { type: "string", enum: COMMONS_COSTS },
        account: { type: "string", enum: COMMONS_ACCOUNTS },
        reuse: { type: "string", enum: COMMONS_REUSE_STATUSES },
        automation: { type: "string", enum: COMMONS_AUTOMATION_STATUSES },
      },
    },
    catalog: {
      type: "object",
      additionalProperties: false,
      required: ["promise", "methodology", "privacy", "foundation", "categories"],
      description: "Catalog overview included only when detail is full",
      properties: {
        promise: { type: "string" },
        methodology: COMMONS_METHODOLOGY_OUTPUT_SCHEMA,
        privacy: COMMONS_PRIVACY_OUTPUT_SCHEMA,
        foundation: COMMONS_FOUNDATION_OUTPUT_SCHEMA,
        categories: { type: "array", items: COMMONS_CATEGORY_OUTPUT_SCHEMA },
      },
    },
    provider_boundary: { type: "string" },
    privacy_boundary: { type: "string" },
    no_guess: { type: "string" },
    filter_boundary: { type: "string" },
    matches: {
      type: "array",
      description: "Ranked resources. Brief records omit only catalog indexing fields; full records add them.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id", "name", "provider", "category_ids", "description", "good_for", "coverage", "access", "reuse",
          "automation", "links", "caveat", "verified",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          provider: { type: "string" },
          category_ids: { type: "array", items: { type: "string", enum: COMMONS_CATEGORY_IDS } },
          good_for: COMMONS_STRING_LIST_SCHEMA,
          coverage: { type: "string" },
          access: COMMONS_ACCESS_OUTPUT_SCHEMA,
          reuse: COMMONS_REUSE_OUTPUT_SCHEMA,
          automation: COMMONS_AUTOMATION_OUTPUT_SCHEMA,
          links: { type: "array", items: COMMONS_LINK_OUTPUT_SCHEMA },
          caveat: { type: "string" },
          verified: { type: "string" },
          description: { type: "string" },
          keywords: COMMONS_STRING_LIST_SCHEMA,
          audiences: COMMONS_STRING_LIST_SCHEMA,
        },
      },
    },
    matched_kits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "invitation", "resource_ids", "matching_resource_ids", "boundary", "steps"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          invitation: { type: "string" },
          resource_ids: COMMONS_STRING_LIST_SCHEMA,
          matching_resource_ids: COMMONS_STRING_LIST_SCHEMA,
          boundary: { type: "string" },
          steps: COMMONS_STRING_LIST_SCHEMA,
          glyph: { type: "string" },
          keywords: COMMONS_STRING_LIST_SCHEMA,
        },
      },
    },
    no_match: { type: "string" },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactRecord(value: unknown, keys: readonly string[], path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  const actual = Object.keys(value);
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  const extra = actual.filter((key) => !keys.includes(key));
  if (missing.length || extra.length) {
    throw new Error(`${path} has an invalid shape`);
  }
}

function stringField(value: unknown, path: string, max = 4_000): string {
  if (typeof value !== "string" || value.trim().length === 0 || [...value].length > max ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error(`${path} must be a non-empty string no longer than ${max} characters`);
  }
  return value;
}

function idField(value: unknown, path: string): string {
  const id = stringField(value, path, 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`${path} must be a lowercase kebab-case id`);
  }
  return id;
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateField(value: unknown, path: string): string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new Error(`${path} must be a real date in YYYY-MM-DD form`);
  }
  return value;
}

function generatedField(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path} must be an ISO date or datetime`);
  if (isIsoDate(value)) return value;
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.exec(value);
  if (!timestamp || !isIsoDate(timestamp[1]!) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${path} must be an ISO date or timezone-qualified datetime`);
  }
  return value;
}

function enumField<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  path: string,
): Values[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return value as Values[number];
}

function stringList(
  value: unknown,
  path: string,
  { min = 1, max = 64, itemMax = 300 }: { min?: number; max?: number; itemMax?: number } = {},
): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${path} must contain ${min}-${max} strings`);
  }
  const result = value.map((item, index) => stringField(item, `${path}[${index}]`, itemMax));
  if (new Set(result).size !== result.length) throw new Error(`${path} must not contain duplicates`);
  return result;
}

function httpsUrl(value: unknown, path: string): string {
  const raw = stringField(value, path, 2_048);
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !isPublicHttpUrl(raw)) throw new Error();
    return raw;
  } catch {
    throw new Error(`${path} must be an uncredentialed HTTPS URL`);
  }
}

function validateCategory(value: unknown, index: number): CommonsCategory {
  const path = `categories[${index}]`;
  assertExactRecord(value, ["id", "label", "glyph", "description"], path);
  const id = idField(value.id, `${path}.id`);
  if (!COMMONS_CATEGORY_IDS.includes(id as CommonsCategoryId)) {
    throw new Error(`${path}.id is not a published commons category`);
  }
  return {
    id: id as CommonsCategoryId,
    label: stringField(value.label, `${path}.label`, 120),
    glyph: stringField(value.glyph, `${path}.glyph`, 32),
    description: stringField(value.description, `${path}.description`, 1_000),
  };
}

function validateAccess(value: unknown, path: string): CommonsAccess {
  assertExactRecord(value, ["cost", "account", "note"], path);
  return {
    cost: enumField(value.cost, COMMONS_COSTS, `${path}.cost`),
    account: enumField(value.account, COMMONS_ACCOUNTS, `${path}.account`),
    note: stringField(value.note, `${path}.note`, 1_000),
  };
}

function validateReuse(value: unknown, path: string): CommonsReuse {
  assertExactRecord(value, ["status", "license", "note"], path);
  return {
    status: enumField(value.status, COMMONS_REUSE_STATUSES, `${path}.status`),
    license: stringField(value.license, `${path}.license`, 300),
    note: stringField(value.note, `${path}.note`, 1_000),
  };
}

function validateAutomation(value: unknown, path: string): CommonsAutomation {
  assertExactRecord(value, ["status", "auth", "limits", "note"], path);
  return {
    status: enumField(value.status, COMMONS_AUTOMATION_STATUSES, `${path}.status`),
    auth: enumField(value.auth, COMMONS_AUTOMATION_AUTHS, `${path}.auth`),
    limits: stringField(value.limits, `${path}.limits`, 500),
    note: stringField(value.note, `${path}.note`, 1_000),
  };
}

function validateLink(value: unknown, resourcePath: string, index: number): CommonsLink {
  const path = `${resourcePath}.links[${index}]`;
  assertExactRecord(value, ["label", "url", "type"], path);
  return {
    label: stringField(value.label, `${path}.label`, 160),
    url: httpsUrl(value.url, `${path}.url`),
    type: enumField(value.type, COMMONS_LINK_TYPES, `${path}.type`),
  };
}

function validateMethodology(value: unknown): CommonsMethodology {
  const path = "commons document.methodology";
  assertExactRecord(value, ["summary", "classification", "maintenance", "boundary"], path);
  return {
    summary: stringField(value.summary, `${path}.summary`, 2_000),
    classification: stringField(value.classification, `${path}.classification`, 2_000),
    maintenance: stringField(value.maintenance, `${path}.maintenance`, 2_000),
    boundary: stringField(value.boundary, `${path}.boundary`, 2_000),
  };
}

function validatePrivacy(value: unknown): CommonsPrivacy {
  const path = "commons document.privacy";
  assertExactRecord(value, ["human_surface", "machine_surface"], path);
  return {
    human_surface: stringField(value.human_surface, `${path}.human_surface`, 2_000),
    machine_surface: stringField(value.machine_surface, `${path}.machine_surface`, 2_000),
  };
}

function validateFoundation(value: unknown): CommonsFoundation {
  const path = "commons document.foundation";
  assertExactRecord(value, ["meaning", "criteria", "resource_ids"], path);
  return {
    meaning: stringField(value.meaning, `${path}.meaning`, 2_000),
    criteria: stringList(value.criteria, `${path}.criteria`, { max: 16, itemMax: 500 }),
    resource_ids: stringList(value.resource_ids, `${path}.resource_ids`, { max: 64, itemMax: 80 }),
  };
}

function validateResource(value: unknown, index: number): CommonsResource {
  const path = `resources[${index}]`;
  assertExactRecord(value, [
    "id", "name", "provider", "category_ids", "description", "good_for", "coverage", "keywords",
    "audiences", "access", "reuse", "automation", "links", "caveat", "verified",
  ], path);

  const categoryIds = stringList(value.category_ids, `${path}.category_ids`, { max: COMMONS_CATEGORY_IDS.length, itemMax: 40 });
  if (categoryIds.some((id) => !COMMONS_CATEGORY_IDS.includes(id as CommonsCategoryId))) {
    throw new Error(`${path}.category_ids contains an unknown category reference`);
  }
  if (!Array.isArray(value.links) || value.links.length < 1 || value.links.length > 12) {
    throw new Error(`${path}.links must contain 1-12 links`);
  }

  return {
    id: idField(value.id, `${path}.id`),
    name: stringField(value.name, `${path}.name`, 200),
    provider: stringField(value.provider, `${path}.provider`, 200),
    category_ids: categoryIds as CommonsCategoryId[],
    description: stringField(value.description, `${path}.description`, 2_000),
    good_for: stringList(value.good_for, `${path}.good_for`, { max: 16, itemMax: 300 }),
    coverage: stringField(value.coverage, `${path}.coverage`, 1_000),
    keywords: stringList(value.keywords, `${path}.keywords`, { max: 64, itemMax: 120 }),
    audiences: stringList(value.audiences, `${path}.audiences`, { max: 16, itemMax: 120 }),
    access: validateAccess(value.access, `${path}.access`),
    reuse: validateReuse(value.reuse, `${path}.reuse`),
    automation: validateAutomation(value.automation, `${path}.automation`),
    links: value.links.map((link, linkIndex) => validateLink(link, path, linkIndex)),
    caveat: stringField(value.caveat, `${path}.caveat`, 2_000),
    verified: dateField(value.verified, `${path}.verified`),
  };
}

function validateKit(value: unknown, index: number): CommonsKit {
  const path = `kits[${index}]`;
  assertExactRecord(value, [
    "id", "label", "glyph", "invitation", "keywords", "resource_ids", "boundary", "steps",
  ], path);
  return {
    id: idField(value.id, `${path}.id`),
    label: stringField(value.label, `${path}.label`, 200),
    glyph: stringField(value.glyph, `${path}.glyph`, 32),
    invitation: stringField(value.invitation, `${path}.invitation`, 1_000),
    keywords: stringList(value.keywords, `${path}.keywords`, { max: 64, itemMax: 120 }),
    resource_ids: stringList(value.resource_ids, `${path}.resource_ids`, { max: 32, itemMax: 80 }),
    boundary: stringField(value.boundary, `${path}.boundary`, 1_500),
    steps: stringList(value.steps, `${path}.steps`, { max: 16, itemMax: 500 }),
  };
}

function assertUniqueIds(values: Array<{ id: string }>, path: string): void {
  if (new Set(values.map(({ id }) => id)).size !== values.length) {
    throw new Error(`${path} contains duplicate ids`);
  }
}

export function validateCommonsDocument(value: unknown): CommonsDocument {
  assertExactRecord(value, [
    "schema_version", "generated", "verified", "canonical_url", "promise", "methodology", "privacy",
    "foundation", "categories", "kits", "resources",
  ], "commons document");
  if (value.schema_version !== COMMONS_SCHEMA_VERSION) {
    throw new Error("commons document has an unsupported schema_version");
  }
  if (value.canonical_url !== COMMONS_SOURCE_URL) {
    throw new Error("commons document canonical_url is not the fixed source URL");
  }
  if (!Array.isArray(value.categories) || value.categories.length !== COMMONS_CATEGORY_IDS.length) {
    throw new Error(`commons document must contain exactly ${COMMONS_CATEGORY_IDS.length} categories`);
  }
  if (!Array.isArray(value.kits) || value.kits.length < 1 || value.kits.length > 64) {
    throw new Error("commons document must contain 1-64 kits");
  }
  if (!Array.isArray(value.resources) || value.resources.length < 1 || value.resources.length > 512) {
    throw new Error("commons document must contain 1-512 resources");
  }

  const categories = value.categories.map(validateCategory);
  const kits = value.kits.map(validateKit);
  const resources = value.resources.map(validateResource);
  const foundation = validateFoundation(value.foundation);
  assertUniqueIds(categories, "categories");
  assertUniqueIds(kits, "kits");
  assertUniqueIds(resources, "resources");

  const categoryIds = new Set(categories.map(({ id }) => id));
  if (COMMONS_CATEGORY_IDS.some((id) => !categoryIds.has(id))) {
    throw new Error("commons document does not contain the complete published category set");
  }
  const resourceIds = new Set(resources.map(({ id }) => id));
  if (foundation.resource_ids.some((id) => !resourceIds.has(id))) {
    throw new Error("commons document.foundation.resource_ids contains an unknown resource reference");
  }
  for (const [index, kit] of kits.entries()) {
    if (kit.resource_ids.some((id) => !resourceIds.has(id))) {
      throw new Error(`kits[${index}].resource_ids contains an unknown resource reference`);
    }
  }

  return {
    schema_version: COMMONS_SCHEMA_VERSION,
    generated: generatedField(value.generated, "commons document.generated"),
    verified: dateField(value.verified, "commons document.verified"),
    canonical_url: COMMONS_SOURCE_URL,
    promise: stringField(value.promise, "commons document.promise", 2_000),
    methodology: validateMethodology(value.methodology),
    privacy: validatePrivacy(value.privacy),
    foundation,
    categories,
    kits,
    resources,
  };
}

export async function readCommonsCatalog(fetcher: Fetcher = globalThis.fetch): Promise<CommonsDocument> {
  const response = await fetcher(COMMONS_SOURCE_URL, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(COMMONS_SOURCE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`public commons catalog → ${response.status}`);
  if (response.url !== COMMONS_SOURCE_URL) {
    throw new Error("public commons catalog resolved away from its fixed canonical URL");
  }

  const mediaType = (response.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new Error("public commons catalog returned a non-application/json media type");
  }

  const declaredHeader = response.headers.get("content-length");
  if (declaredHeader !== null) {
    if (!/^\d+$/.test(declaredHeader.trim())) {
      throw new Error("public commons catalog returned an invalid content-length");
    }
    if (Number(declaredHeader) > MAX_COMMONS_SOURCE_BYTES) {
      throw new Error("public commons catalog is unexpectedly large");
    }
  }
  if (!response.body) throw new Error("public commons catalog returned an empty body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      received += chunk.byteLength;
      if (received > MAX_COMMONS_SOURCE_BYTES) {
        try {
          await reader.cancel("public commons catalog exceeded the byte limit");
        } catch {
          // Cancellation is best-effort; the response still fails closed.
        }
        throw new Error("public commons catalog is unexpectedly large");
      }
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof Error && error.message === "public commons catalog is unexpectedly large") throw error;
    throw new Error("public commons catalog response could not be read safely");
  }

  try {
    return validateCommonsDocument(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("public commons catalog returned invalid JSON");
    throw error;
  }
}

export function normalizeCommonsText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function words(value: string, limit = 32): string[] {
  return [...new Set(normalizeCommonsText(value).split(" ")
    .filter((word) => (word.length > 1 || /^\d$/.test(word)) && !STOPWORDS.has(word)))].slice(0, limit);
}

function overlapScore(needWords: string[], value: string | string[], weight: number): number {
  const haystack = new Set(words(Array.isArray(value) ? value.join(" ") : value, 256));
  return needWords.reduce((score, word) => score + (haystack.has(word) ? weight : 0), 0);
}

export function rankCommonsResources(
  resources: CommonsResource[],
  need: string,
  category?: CommonsCategoryId,
): Array<{ resource: CommonsResource; score: number }> {
  const normalized = normalizeCommonsText(need);
  const needWords = words(need);
  if (!normalized || !needWords.length) return [];

  return resources.filter((resource) => !category || resource.category_ids.includes(category))
    .map((resource) => {
      if (normalized === normalizeCommonsText(resource.id)) return { resource, score: 2_000 };
      if (normalized === normalizeCommonsText(resource.name)) return { resource, score: 1_900 };
      let score = 0;
      score += overlapScore(needWords, resource.keywords, 30);
      score += overlapScore(needWords, `${resource.id} ${resource.name}`, 22);
      score += overlapScore(needWords, resource.provider, 14);
      score += overlapScore(needWords, resource.good_for, 12);
      score += overlapScore(needWords, resource.audiences, 8);
      score += overlapScore(needWords, `${resource.description} ${resource.coverage}`, 4);
      return { resource, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || compareText(a.resource.name, b.resource.name) || compareText(a.resource.id, b.resource.id));
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function filterCommonsResources(
  resources: CommonsResource[],
  filters: CommonsFilters,
): CommonsResource[] {
  return resources.filter((resource) =>
    (!filters.category || resource.category_ids.includes(filters.category)) &&
    (!filters.cost || resource.access.cost === filters.cost) &&
    (!filters.account || resource.access.account === filters.account) &&
    (!filters.reuse || resource.reuse.status === filters.reuse) &&
    (!filters.automation || resource.automation.status === filters.automation)
  );
}

function rankCommonsKits(
  kits: CommonsKit[],
  need: string,
  rankedResources: Array<{ resource: CommonsResource; score: number }>,
  allowedResourceIds: Set<string>,
): Array<{ kit: CommonsKit; score: number }> {
  const normalized = normalizeCommonsText(need);
  const needWords = words(need);
  const matchedResourceIds = new Set(rankedResources.map(({ resource }) => resource.id));
  if (!normalized || !needWords.length) return [];

  return kits.filter((kit) => kit.resource_ids.some((id) => allowedResourceIds.has(id)))
    .map((kit) => {
      if (normalized === normalizeCommonsText(kit.id)) return { kit, score: 2_000 };
      if (normalized === normalizeCommonsText(kit.label)) return { kit, score: 1_900 };
      let score = 0;
      score += overlapScore(needWords, kit.keywords, 30);
      score += overlapScore(needWords, `${kit.id} ${kit.label}`, 22);
      score += overlapScore(needWords, `${kit.invitation} ${kit.steps.join(" ")}`, 5);
      score += kit.resource_ids.filter((id) => matchedResourceIds.has(id)).length * 3;
      return { kit, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || compareText(a.kit.label, b.kit.label) || compareText(a.kit.id, b.kit.id));
}

function briefResource(resource: CommonsResource) {
  return {
    id: resource.id,
    name: resource.name,
    provider: resource.provider,
    category_ids: resource.category_ids,
    description: resource.description,
    good_for: resource.good_for,
    coverage: resource.coverage,
    access: resource.access,
    reuse: resource.reuse,
    automation: resource.automation,
    links: resource.links,
    caveat: resource.caveat,
    verified: resource.verified,
  };
}

function formatKit(kit: CommonsKit, allowedResourceIds: Set<string>, detail: CommonsDetail) {
  const matchingResourceIds = kit.resource_ids.filter((id) => allowedResourceIds.has(id));
  if (detail === "full") return { ...kit, matching_resource_ids: matchingResourceIds };
  return {
    id: kit.id,
    label: kit.label,
    invitation: kit.invitation,
    resource_ids: kit.resource_ids,
    matching_resource_ids: matchingResourceIds,
    boundary: kit.boundary,
    steps: kit.steps,
  };
}

function optionalEnum<const Values extends readonly string[]>(
  value: unknown,
  allowed: Values,
  name: string,
): Values[number] | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return value as Values[number];
}

function parseArgs(raw: unknown): { need: string; filters: CommonsFilters; detail: CommonsDetail; limit: number } {
  if (!isRecord(raw)) throw new Error("arguments must be an object with need and optional exact filters, detail, and limit");
  const allowed = new Set(["need", "category", "cost", "account", "reuse", "automation", "detail", "limit"]);
  const extra = Object.keys(raw).filter((key) => !allowed.has(key));
  if (extra.length) {
    throw new Error("credentials and other fields are refused; provide only need, exact catalog filters, detail, and limit");
  }
  if (typeof raw.need !== "string") throw new Error("need must be a string");
  const need = raw.need.trim();
  if (!need || [...need].length > MAX_NEED_LENGTH) {
    throw new Error(`need must contain 1-${MAX_NEED_LENGTH} characters`);
  }

  const filters: CommonsFilters = {};
  const category = optionalEnum(raw.category, COMMONS_CATEGORY_IDS, "category");
  const cost = optionalEnum(raw.cost, COMMONS_COSTS, "cost");
  const account = optionalEnum(raw.account, COMMONS_ACCOUNTS, "account");
  const reuse = optionalEnum(raw.reuse, COMMONS_REUSE_STATUSES, "reuse");
  const automation = optionalEnum(raw.automation, COMMONS_AUTOMATION_STATUSES, "automation");
  if (category) filters.category = category;
  if (cost) filters.cost = cost;
  if (account) filters.account = account;
  if (reuse) filters.reuse = reuse;
  if (automation) filters.automation = automation;

  const detail = optionalEnum(raw.detail, COMMONS_DETAIL_LEVELS, "detail") ?? "brief";
  const limit = raw.limit === undefined ? DEFAULT_LIMIT : raw.limit;
  if (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 8) {
    throw new Error("limit must be an integer from 1 to 8");
  }
  return { need, filters, detail, limit: limit as number };
}

export async function runCommons(raw: unknown, fetcher: Fetcher = globalThis.fetch): Promise<unknown> {
  const { need, filters, detail, limit } = parseArgs(raw);
  const document = await readCommonsCatalog(fetcher);
  const eligibleResources = filterCommonsResources(document.resources, filters);
  const rankedResources = rankCommonsResources(eligibleResources, need);
  const matches = rankedResources.slice(0, limit).map(({ resource }) =>
    detail === "full" ? resource : briefResource(resource)
  );
  const allowedResourceIds = new Set(eligibleResources.map(({ id }) => id));
  const matchedKits = rankCommonsKits(document.kits, need, rankedResources, allowedResourceIds)
    .slice(0, limit)
    .map(({ kit }) => formatKit(kit, allowedResourceIds, detail));

  return {
    detail,
    source: {
      url: COMMONS_SOURCE_URL,
      canonical_url: document.canonical_url,
      schema_version: document.schema_version,
      generated: document.generated,
      verified: document.verified,
    },
    catalog_resource: COMMONS_RESOURCE_URI,
    filters,
    ...(detail === "full" ? {
      catalog: {
        promise: document.promise,
        methodology: document.methodology,
        privacy: document.privacy,
        foundation: document.foundation,
        categories: document.categories,
      },
    } : {}),
    provider_boundary:
      "No listed provider was contacted; only the fixed Kingdom catalog was fetched. Resource links are metadata and were not followed.",
    privacy_boundary:
      "need is used only in memory for literal matching: it is not put in the catalog request, persisted, or returned as a field. Canonical catalog text may naturally contain the same words. Hosting and network infrastructure remain separate; never send secrets.",
    no_guess:
      "Literal possibilities only: not endorsements, professional advice, eligibility findings, or inferred intent. An empty match stays empty.",
    filter_boundary:
      "Exact filters apply to matches; each kit's matching_resource_ids shows references inside that boundary.",
    matches,
    matched_kits: matchedKits,
    ...(!matches.length && !matchedKits.length ? {
      no_match: "No literal catalog match appeared within the selected exact filters. The tool will not guess what the need means.",
    } : {}),
  };
}

export const MAX_COMMONS_COMPATIBILITY_TEXT_CHARS = 6_000;

function compactText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function compactList(value: unknown, maxItems = 8, maxChars = 240): string {
  if (!Array.isArray(value)) return "";
  const items = value
    .filter((item): item is string => typeof item === "string")
    .slice(0, maxItems)
    .map((item) => compactText(item, 80));
  const suffix = value.length > maxItems ? ` +${value.length - maxItems}` : "";
  return compactText(`${items.join(", ")}${suffix}`, maxChars);
}

/**
 * Bounded compatibility text for MCP clients that do not consume
 * structuredContent. The structured object remains the canonical result.
 */
export function formatCommonsCompatibilityText(result: unknown): string {
  if (!isRecord(result)) {
    return compactText(JSON.stringify(result) ?? String(result), MAX_COMMONS_COMPATIBILITY_TEXT_CHARS);
  }

  const source = isRecord(result.source) ? result.source : {};
  const matches = Array.isArray(result.matches) ? result.matches.filter(isRecord) : [];
  const kits = Array.isArray(result.matched_kits) ? result.matched_kits.filter(isRecord) : [];
  const verified = compactText(source.verified, 32) || "unknown";
  const sourceUrl = compactText(source.url, 300) || COMMONS_SOURCE_URL;
  const catalogResource = compactText(result.catalog_resource, 200) || COMMONS_RESOURCE_URI;
  const footer = [
    `Boundary: ${compactText(result.no_guess, 420) || "Literal possibilities only; nothing is guessed."}`,
    `Text-only client: use an id above for another compact match. For complete records or the entire validated catalog, read ${catalogResource}. Structured content is the canonical selected result.`,
  ];
  const lines = [
    `World Commons · verified ${verified} · ${matches.length} resource match${matches.length === 1 ? "" : "es"} · ${kits.length} kit${kits.length === 1 ? "" : "s"}`,
    `Source: ${sourceUrl}`,
  ];

  if (isRecord(result.filters) && Object.keys(result.filters).length) {
    const filters = Object.entries(result.filters)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => `${key}=${compactText(value, 40)}`)
      .join(" · ");
    if (filters) lines.push(`Exact filters: ${filters}`);
  }

  let omittedBlocks = 0;
  const footerReserve = footer.join("\n").length + 120;
  const appendBlock = (block: string[]) => {
    const nextLength = [...lines, ...block].join("\n").length + footerReserve;
    if (nextLength <= MAX_COMMONS_COMPATIBILITY_TEXT_CHARS) lines.push(...block);
    else omittedBlocks += 1;
  };

  for (const match of matches) {
    const access = isRecord(match.access) ? match.access : {};
    const reuse = isRecord(match.reuse) ? match.reuse : {};
    const automation = isRecord(match.automation) ? match.automation : {};
    const links = Array.isArray(match.links) ? match.links.filter(isRecord) : [];
    const automationStatus = compactText(automation.status, 40);
    const linkOrder = automationStatus === "bulk-preferred"
      ? ["bulk", "api", "start", "docs", "terms"]
      : automationStatus === "human-only" || automationStatus === "local"
        ? ["start", "docs", "terms", "api", "bulk"]
        : ["api", "bulk", "start", "docs", "terms"];
    const primary: Record<string, unknown> =
      linkOrder.map((type) => links.find((link) => link.type === type)).find(Boolean) ?? links[0] ?? {};
    appendBlock([
      `- ${compactText(match.id, 80) || "unknown"} · ${compactText(match.name, 140) || "Unnamed resource"} — ${compactText(match.provider, 140) || "unknown provider"}`,
      `  access ${compactText(access.cost, 40) || "unknown"}; account ${compactText(access.account, 40) || "unknown"} · reuse ${compactText(reuse.status, 40) || "unknown"} (${compactText(reuse.license, 100) || "check terms"}) · automation ${compactText(automation.status, 40) || "unknown"}; auth ${compactText(automation.auth, 40) || "unknown"} · checked ${compactText(match.verified, 32) || "unknown"}`,
      `  link${typeof primary.type === "string" ? ` (${compactText(primary.type, 24)})` : ""}: ${compactText(primary.url, 320) || "see structured content"}`,
      `  care: ${compactText(match.caveat, 240) || "Read the steward's current boundaries."}`,
    ]);
  }

  let kitHeadingAdded = false;
  for (const kit of kits) {
    const block = [
      `${kitHeadingAdded ? "" : "Kits:\n"}- ${compactText(kit.id, 80) || "unknown"} · ${compactText(kit.label, 140) || "Unnamed kit"} → ${compactList(kit.matching_resource_ids) || "no resources inside the selected filter boundary"}`,
      `  care: ${compactText(kit.boundary, 220) || "Read the kit boundary in structured content."}`,
    ];
    const before = omittedBlocks;
    appendBlock(block);
    if (omittedBlocks === before) kitHeadingAdded = true;
  }

  if (typeof result.no_match === "string") lines.push(`No match: ${compactText(result.no_match, 300)}`);
  if (omittedBlocks) lines.push(`${omittedBlocks} additional selected item${omittedBlocks === 1 ? "" : "s"} remain in structured content.`);
  lines.push(...footer);
  const text = lines.join("\n");
  return text.length <= MAX_COMMONS_COMPATIBILITY_TEXT_CHARS
    ? text
    : `${text.slice(0, MAX_COMMONS_COMPATIBILITY_TEXT_CHARS - 1).trimEnd()}…`;
}
