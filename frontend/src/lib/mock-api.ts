/**
 * Real API client for the SplitIt backend (see /openapi.yaml at the repo
 * root, served by the FastAPI app in backend/).
 *
 * Every function here mirrors one endpoint from spec §6 (`/api/v1/...`),
 * takes and returns the same JSON shapes callers already expect. Auth is
 * two per-group cookies the browser manages automatically: a PIN-gated
 * session cookie and a device-identity cookie (see docs/spec.md §3.2, §7.2).
 */

import {
  ApiError,
  type BalancesResponse,
  type BreakdownLine,
  type CreateGroupInput,
  type Expense,
  type ExpenseInput,
  type Group,
  type Member,
  type Settlement,
  type SettlementInput,
  type SplitInput,
  type SplitRow,
} from "./types";

const RECENT_KEY = "splitit.recent.v1";

export const DEMO_SLUG = "kQ7xR2mVb9LtYc4PzNs1Aw";

const API_BASE =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:8000/api/v1";

// ------------------------------------------------------------------- transport

interface ProblemDetail {
  status?: number;
  code?: string;
  title?: string;
  detail?: string;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
  };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Is the backend running?");
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const data: unknown = contentType.includes("json")
    ? await res.json().catch(() => undefined)
    : undefined;

  if (!res.ok) {
    const problem = (data ?? {}) as ProblemDetail;
    throw new ApiError(
      res.status,
      problem.code ?? "UNKNOWN_ERROR",
      problem.title ?? problem.detail ?? res.statusText,
    );
  }
  return data as T;
}

// ------------------------------------------------------------------- session

/** POST /g/{slug}/session — verifies the group PIN and sets the session cookie. */
export async function verifyPin(slug: string, pin: string): Promise<void> {
  await request("POST", `/g/${slug}/session`, { pin });
}

// ------------------------------------------------------------ device identity

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

/** Reads the `splitit_identity_{slug}` cookie the backend sets (not HttpOnly by design). */
export function getIdentity(slug: string): string | null {
  return readCookie(`splitit_identity_${slug}`);
}

/** PUT /g/{slug}/session/identity */
export async function setIdentity(slug: string, memberId: string): Promise<void> {
  await request("PUT", `/g/${slug}/session/identity`, { member_id: memberId });
}

// ------------------------------------------------------- recent groups (local)

export interface RecentGroup {
  slug: string;
  name: string;
  currency_code: string;
  last_opened_at: string;
}

export function listRecentGroups(): RecentGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as RecentGroup[];
    return stored.sort((a, b) => b.last_opened_at.localeCompare(a.last_opened_at));
  } catch {
    return [];
  }
}

export function rememberGroup(group: Group) {
  if (typeof window === "undefined") return;
  const entry: RecentGroup = {
    slug: group.slug,
    name: group.name,
    currency_code: group.currency_code,
    last_opened_at: new Date().toISOString(),
  };
  const rest = listRecentGroups().filter((r) => r.slug !== group.slug);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...rest].slice(0, 12)));
}

// ------------------------------------------------------------------- groups

/** POST /groups */
export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const group = await request<Group>("POST", "/groups", input);
  rememberGroup(group);
  return group;
}

/** GET /g/{slug} */
export async function getGroup(slug: string): Promise<Group> {
  const group = await request<Group>("GET", `/g/${slug}`);
  rememberGroup(group);
  return group;
}

/** PATCH /g/{slug} */
export async function updateGroup(slug: string, patch: { name?: string }): Promise<Group> {
  const group = await request<Group>("PATCH", `/g/${slug}`, patch);
  rememberGroup(group);
  return group;
}

// ------------------------------------------------------------------ members

/** POST /g/{slug}/members */
export async function addMember(slug: string, name: string): Promise<Member> {
  return request("POST", `/g/${slug}/members`, { name });
}

/** PATCH /g/{slug}/members/{id} */
export async function renameMember(slug: string, memberId: string, name: string): Promise<Member> {
  return request("PATCH", `/g/${slug}/members/${memberId}`, { name });
}

/** DELETE /g/{slug}/members/{id} — only allowed at a zero balance (FR-M3). */
export async function removeMember(slug: string, memberId: string): Promise<void> {
  await request("DELETE", `/g/${slug}/members/${memberId}`);
}

// ----------------------------------------------------------------- expenses

export interface ExpenseFilters {
  member?: string | undefined;
  q?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

/** GET /g/{slug}/expenses */
export async function listExpenses(slug: string, filters: ExpenseFilters = {}): Promise<Expense[]> {
  const qs = buildQuery({
    member: filters.member,
    q: filters.q,
    from: filters.from,
    to: filters.to,
  });
  return request("GET", `/g/${slug}/expenses${qs}`);
}

/** POST /g/{slug}/expenses/preview-split — shares without saving (FR-E5). */
export async function previewSplit(
  slug: string,
  body: {
    total_minor: number;
    split: SplitInput;
    payers: { member_id: string; paid_minor: number }[];
  },
): Promise<{ splits: SplitRow[] }> {
  return request("POST", `/g/${slug}/expenses/preview-split`, body);
}

/** POST /g/{slug}/expenses */
export async function createExpense(
  slug: string,
  input: ExpenseInput,
  actorMemberId: string,
): Promise<Expense> {
  if (!actorMemberId) throw new ApiError(409, "IDENTITY_REQUIRED", "Pick who you are first.");
  return request("POST", `/g/${slug}/expenses`, input);
}

/** PATCH /g/{slug}/expenses/{id} */
export async function updateExpense(
  slug: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<Expense> {
  return request("PATCH", `/g/${slug}/expenses/${expenseId}`, input);
}

/** DELETE /g/{slug}/expenses/{id} — soft delete. */
export async function deleteExpense(slug: string, expenseId: string): Promise<void> {
  await request("DELETE", `/g/${slug}/expenses/${expenseId}`);
}

/** POST /g/{slug}/expenses/{id}/restore */
export async function restoreExpense(slug: string, expenseId: string): Promise<void> {
  await request("POST", `/g/${slug}/expenses/${expenseId}/restore`);
}

// -------------------------------------------------------------- settlements

/** GET /g/{slug}/settlements */
export async function listSettlements(slug: string): Promise<Settlement[]> {
  return request("GET", `/g/${slug}/settlements`);
}

/** POST /g/{slug}/settlements */
export async function createSettlement(slug: string, input: SettlementInput): Promise<Settlement> {
  return request("POST", `/g/${slug}/settlements`, input);
}

/** DELETE /g/{slug}/settlements/{id} */
export async function deleteSettlement(slug: string, settlementId: string): Promise<void> {
  await request("DELETE", `/g/${slug}/settlements/${settlementId}`);
}

// ----------------------------------------------------------------- balances

/** GET /g/{slug}/balances */
export async function getBalances(slug: string): Promise<BalancesResponse> {
  return request("GET", `/g/${slug}/balances`);
}

/** GET /g/{slug}/balances/{member_id} */
export async function getMemberBreakdown(slug: string, memberId: string): Promise<BreakdownLine[]> {
  return request("GET", `/g/${slug}/balances/${memberId}`);
}
