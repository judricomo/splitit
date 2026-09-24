/**
 * MOCK BACKEND — replace with the real FastAPI client.
 *
 * Every function here mirrors one endpoint from spec §6 (`/api/v1/...`), takes
 * and returns the same JSON shapes, and simulates network latency. State lives
 * in memory and is mirrored to localStorage so a reload keeps your data.
 *
 * To go live: swap the bodies of these functions for `fetch` calls (or a
 * generated openapi-typescript client) — the call signatures stay identical.
 */

import { computeBalances, computeSplits, simplifyDebts, validatePayers } from "./ledger";
import { exponentFor } from "./money";
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

const STORAGE_KEY = "splitit.mock.db.v1";
const IDENTITY_KEY = "splitit.identity.v1";
const RECENT_KEY = "splitit.recent.v1";

interface Db {
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
}

const MEMBER_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function randomSlug() {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 22; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- demo seed

export const DEMO_SLUG = "kQ7xR2mVb9LtYc4PzNs1Aw";

function seedDb(): Db {
  const now = new Date().toISOString();
  const ids = { ana: "mem_ana", luis: "mem_luis", marta: "mem_marta", juan: "mem_juan" };
  const members: Member[] = [
    { id: ids.ana, name: "Ana", color: "chart-1", removed_at: null },
    { id: ids.luis, name: "Luis", color: "chart-2", removed_at: null },
    { id: ids.marta, name: "Marta", color: "chart-3", removed_at: null },
    { id: ids.juan, name: "Juan", color: "chart-4", removed_at: null },
  ];
  const group: Group = {
    id: "grp_demo",
    slug: DEMO_SLUG,
    name: "Cartagena trip",
    currency_code: "COP",
    currency_exponent: 0,
    pin_required: false,
    archived_at: null,
    created_at: now,
    members,
    version: 1,
  };

  const build = (
    id: string,
    description: string,
    total: number,
    spent_on: string,
    payers: { member_id: string; paid_minor: number }[],
    split: SplitInput,
  ): Expense => {
    const { rows } = computeSplits(total, split, payers);
    return {
      id,
      group_id: group.id,
      description,
      total_minor: total,
      spent_on,
      notes: null,
      split_method: split.method,
      payers,
      splits: rows,
      created_by_member_id: payers[0]!.member_id,
      created_at: now,
      deleted_at: null,
      version: 1,
    };
  };

  const expenses: Expense[] = [
    build("exp_dinner", "Dinner", 100000, "2026-09-20", [{ member_id: ids.ana, paid_minor: 100000 }], {
      method: "equal",
      participants: [{ member_id: ids.ana }, { member_id: ids.luis }, { member_id: ids.marta }],
    }),
    build("exp_taxi", "Taxi", 30000, "2026-09-21", [{ member_id: ids.luis, paid_minor: 30000 }], {
      method: "equal",
      participants: [{ member_id: ids.marta }, { member_id: ids.juan }],
    }),
    build(
      "exp_groceries",
      "Groceries",
      120000,
      "2026-09-22",
      [
        { member_id: ids.ana, paid_minor: 80000 },
        { member_id: ids.juan, paid_minor: 40000 },
      ],
      {
        method: "shares",
        participants: [
          { member_id: ids.ana, shares: 2 },
          { member_id: ids.luis, shares: 1 },
          { member_id: ids.marta, shares: 1 },
          { member_id: ids.juan, shares: 2 },
        ],
      },
    ),
  ];

  return { groups: [group], expenses, settlements: [] };
}

// ------------------------------------------------------------- persistence

let db: Db | null = null;

function load(): Db {
  if (db) return db;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        db = JSON.parse(raw) as Db;
        return db;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
  db = seedDb();
  save();
  return db;
}

function save() {
  if (typeof window === "undefined" || !db) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota errors */
  }
}

export function resetMockData() {
  db = seedDb();
  save();
  if (typeof window !== "undefined") window.localStorage.removeItem(RECENT_KEY);
}

// ------------------------------------------------------------ mock transport

async function latency(ms = 180 + Math.random() * 220) {
  await new Promise((r) => setTimeout(r, ms));
}

async function request<T>(method: string, path: string, body?: unknown, run?: () => T): Promise<T> {
  console.info(`[mock API] ${method} /api/v1${path}`, body ?? "");
  await latency();
  const result = run ? run() : (undefined as T);
  save();
  return result;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function findGroup(slug: string): Group {
  const group = load().groups.find((g) => g.slug === slug);
  if (!group) throw new ApiError(404, "GROUP_NOT_FOUND", "This group link is not valid.");
  return group;
}

// ------------------------------------------------------------ device identity

type IdentityMap = Record<string, string>;

function identities(): IdentityMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(IDENTITY_KEY) ?? "{}") as IdentityMap;
  } catch {
    return {};
  }
}

export function getIdentity(slug: string): string | null {
  return identities()[slug] ?? null;
}

/** PUT /g/{slug}/session/identity */
export async function setIdentity(slug: string, memberId: string): Promise<void> {
  return request("PUT", `/g/${slug}/session/identity`, { member_id: memberId }, () => {
    if (typeof window === "undefined") return;
    const map = identities();
    map[slug] = memberId;
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(map));
  });
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
    const known = new Set(load().groups.map((g) => g.slug));
    return stored
      .filter((r) => known.has(r.slug))
      .sort((a, b) => b.last_opened_at.localeCompare(a.last_opened_at));
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
  return request("POST", "/groups", input, () => {
    const names = [input.my_name, ...input.member_names].map((n) => n.trim()).filter(Boolean);
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(n.toLowerCase()))
        throw new ApiError(422, "DUPLICATE_MEMBER", `"${n}" is listed twice.`);
      seen.add(n.toLowerCase());
    }
    const group: Group = {
      id: uid("grp"),
      slug: randomSlug(),
      name: input.name.trim(),
      currency_code: input.currency_code.toUpperCase(),
      currency_exponent: exponentFor(input.currency_code),
      pin_required: Boolean(input.pin),
      archived_at: null,
      created_at: new Date().toISOString(),
      version: 1,
      members: names.map((name, i) => ({
        id: uid("mem"),
        name,
        color: MEMBER_COLORS[i % MEMBER_COLORS.length]!,
        removed_at: null,
      })),
    };
    load().groups.push(group);
    rememberGroup(group);
    if (typeof window !== "undefined") {
      const map = identities();
      map[group.slug] = group.members[0]!.id;
      window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(map));
    }
    return clone(group);
  });
}

/** GET /g/{slug} */
export async function getGroup(slug: string): Promise<Group> {
  return request("GET", `/g/${slug}`, undefined, () => {
    const group = findGroup(slug);
    rememberGroup(group);
    return clone(group);
  });
}

/** PATCH /g/{slug} */
export async function updateGroup(slug: string, patch: { name?: string }): Promise<Group> {
  return request("PATCH", `/g/${slug}`, patch, () => {
    const group = findGroup(slug);
    if (patch.name?.trim()) group.name = patch.name.trim();
    group.version += 1;
    rememberGroup(group);
    return clone(group);
  });
}

// ------------------------------------------------------------------ members

/** POST /g/{slug}/members */
export async function addMember(slug: string, name: string): Promise<Member> {
  return request("POST", `/g/${slug}/members`, { name }, () => {
    const group = findGroup(slug);
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40)
      throw new ApiError(422, "INVALID_NAME", "A name must be 1–40 characters.");
    if (group.members.some((m) => !m.removed_at && m.name.toLowerCase() === trimmed.toLowerCase()))
      throw new ApiError(409, "DUPLICATE_MEMBER", `"${trimmed}" is already in this group.`);
    const member: Member = {
      id: uid("mem"),
      name: trimmed,
      color: MEMBER_COLORS[group.members.length % MEMBER_COLORS.length]!,
      removed_at: null,
    };
    group.members.push(member);
    return clone(member);
  });
}

/** PATCH /g/{slug}/members/{id} */
export async function renameMember(slug: string, memberId: string, name: string): Promise<Member> {
  return request("PATCH", `/g/${slug}/members/${memberId}`, { name }, () => {
    const group = findGroup(slug);
    const member = group.members.find((m) => m.id === memberId);
    if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND", "That member no longer exists.");
    const trimmed = name.trim();
    if (group.members.some((m) => m.id !== memberId && !m.removed_at && m.name.toLowerCase() === trimmed.toLowerCase()))
      throw new ApiError(409, "DUPLICATE_MEMBER", `"${trimmed}" is already in this group.`);
    member.name = trimmed;
    return clone(member);
  });
}

/** DELETE /g/{slug}/members/{id} — only allowed at a zero balance (FR-M3). */
export async function removeMember(slug: string, memberId: string): Promise<void> {
  return request("DELETE", `/g/${slug}/members/${memberId}`, undefined, () => {
    const group = findGroup(slug);
    const member = group.members.find((m) => m.id === memberId);
    if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND", "That member no longer exists.");
    const store = load();
    const balances = computeBalances(
      group.members.map((m) => m.id),
      store.expenses.filter((e) => e.group_id === group.id),
      store.settlements.filter((s) => s.group_id === group.id),
    );
    const row = balances.find((b) => b.member_id === memberId);
    if (row && row.balance !== 0)
      throw new ApiError(
        409,
        "BALANCE_NOT_ZERO",
        `${member.name} still has an open balance. Settle up first.`,
      );
    member.removed_at = new Date().toISOString();
  });
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
  return request("GET", `/g/${slug}/expenses`, filters, () => {
    const group = findGroup(slug);
    let rows = load().expenses.filter((e) => e.group_id === group.id && !e.deleted_at);
    if (filters.member) {
      rows = rows.filter(
        (e) =>
          e.payers.some((p) => p.member_id === filters.member) ||
          e.splits.some((s) => s.member_id === filters.member),
      );
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      rows = rows.filter((e) => e.description.toLowerCase().includes(q));
    }
    if (filters.from) rows = rows.filter((e) => e.spent_on >= filters.from!);
    if (filters.to) rows = rows.filter((e) => e.spent_on <= filters.to!);
    rows.sort((a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
    return clone(rows);
  });
}

/** POST /g/{slug}/expenses/preview-split — shares without saving (FR-E5). */
export async function previewSplit(
  slug: string,
  body: { total_minor: number; split: SplitInput; payers: { member_id: string; paid_minor: number }[] },
): Promise<{ splits: SplitRow[] }> {
  return request("POST", `/g/${slug}/expenses/preview-split`, body, () => {
    const { rows, error } = computeSplits(body.total_minor, body.split, body.payers);
    if (error) throw new ApiError(422, "INVALID_SPLIT", error);
    return { splits: rows };
  });
}

function validateExpense(input: ExpenseInput) {
  if (input.description.trim().length < 1 || input.description.trim().length > 120)
    throw new ApiError(422, "INVALID_DESCRIPTION", "The description must be 1–120 characters.");
  if (input.total_minor <= 0) throw new ApiError(422, "INVALID_TOTAL", "The total must be greater than 0.");
  const payerError = validatePayers(input.total_minor, input.payers);
  if (payerError) throw new ApiError(422, "PAYERS_MISMATCH", payerError);
  const { rows, error } = computeSplits(input.total_minor, input.split, input.payers);
  if (error) throw new ApiError(422, "INVALID_SPLIT", error);
  return rows;
}

/** POST /g/{slug}/expenses */
export async function createExpense(
  slug: string,
  input: ExpenseInput,
  actorMemberId: string,
): Promise<Expense> {
  return request("POST", `/g/${slug}/expenses`, input, () => {
    const group = findGroup(slug);
    if (!actorMemberId) throw new ApiError(409, "IDENTITY_REQUIRED", "Pick who you are first.");
    const splits = validateExpense(input);
    const expense: Expense = {
      id: uid("exp"),
      group_id: group.id,
      description: input.description.trim(),
      total_minor: input.total_minor,
      spent_on: input.spent_on || today(),
      notes: input.notes?.trim() || null,
      split_method: input.split.method,
      payers: input.payers.filter((p) => p.paid_minor > 0),
      splits,
      created_by_member_id: actorMemberId,
      created_at: new Date().toISOString(),
      deleted_at: null,
      version: 1,
    };
    load().expenses.push(expense);
    return clone(expense);
  });
}

/** PATCH /g/{slug}/expenses/{id} */
export async function updateExpense(
  slug: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<Expense> {
  return request("PATCH", `/g/${slug}/expenses/${expenseId}`, input, () => {
    findGroup(slug);
    const expense = load().expenses.find((e) => e.id === expenseId);
    if (!expense) throw new ApiError(404, "EXPENSE_NOT_FOUND", "That expense no longer exists.");
    const splits = validateExpense(input);
    expense.description = input.description.trim();
    expense.total_minor = input.total_minor;
    expense.spent_on = input.spent_on;
    expense.notes = input.notes?.trim() || null;
    expense.split_method = input.split.method;
    expense.payers = input.payers.filter((p) => p.paid_minor > 0);
    expense.splits = splits;
    expense.version += 1;
    return clone(expense);
  });
}

/** DELETE /g/{slug}/expenses/{id} — soft delete. */
export async function deleteExpense(slug: string, expenseId: string): Promise<void> {
  return request("DELETE", `/g/${slug}/expenses/${expenseId}`, undefined, () => {
    findGroup(slug);
    const expense = load().expenses.find((e) => e.id === expenseId);
    if (!expense) throw new ApiError(404, "EXPENSE_NOT_FOUND", "That expense no longer exists.");
    expense.deleted_at = new Date().toISOString();
  });
}

/** POST /g/{slug}/expenses/{id}/restore */
export async function restoreExpense(slug: string, expenseId: string): Promise<void> {
  return request("POST", `/g/${slug}/expenses/${expenseId}/restore`, undefined, () => {
    findGroup(slug);
    const expense = load().expenses.find((e) => e.id === expenseId);
    if (!expense) throw new ApiError(404, "EXPENSE_NOT_FOUND", "That expense no longer exists.");
    expense.deleted_at = null;
  });
}

// -------------------------------------------------------------- settlements

/** GET /g/{slug}/settlements */
export async function listSettlements(slug: string): Promise<Settlement[]> {
  return request("GET", `/g/${slug}/settlements`, undefined, () => {
    const group = findGroup(slug);
    const rows = load()
      .settlements.filter((s) => s.group_id === group.id && !s.deleted_at)
      .sort((a, b) => b.settled_on.localeCompare(a.settled_on));
    return clone(rows);
  });
}

/** POST /g/{slug}/settlements */
export async function createSettlement(slug: string, input: SettlementInput): Promise<Settlement> {
  return request("POST", `/g/${slug}/settlements`, input, () => {
    const group = findGroup(slug);
    if (input.from_member_id === input.to_member_id)
      throw new ApiError(422, "SAME_MEMBER", "Pick two different members.");
    if (input.amount_minor <= 0)
      throw new ApiError(422, "INVALID_AMOUNT", "The amount must be greater than 0.");
    const settlement: Settlement = {
      id: uid("stl"),
      group_id: group.id,
      from_member_id: input.from_member_id,
      to_member_id: input.to_member_id,
      amount_minor: input.amount_minor,
      settled_on: input.settled_on || today(),
      note: input.note?.trim() || null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      version: 1,
    };
    load().settlements.push(settlement);
    return clone(settlement);
  });
}

/** DELETE /g/{slug}/settlements/{id} */
export async function deleteSettlement(slug: string, settlementId: string): Promise<void> {
  return request("DELETE", `/g/${slug}/settlements/${settlementId}`, undefined, () => {
    findGroup(slug);
    const settlement = load().settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new ApiError(404, "SETTLEMENT_NOT_FOUND", "That payment no longer exists.");
    settlement.deleted_at = new Date().toISOString();
  });
}

// ----------------------------------------------------------------- balances

/** GET /g/{slug}/balances */
export async function getBalances(slug: string): Promise<BalancesResponse> {
  return request("GET", `/g/${slug}/balances`, undefined, () => {
    const group = findGroup(slug);
    const store = load();
    const balances = computeBalances(
      group.members.filter((m) => !m.removed_at).map((m) => m.id),
      store.expenses.filter((e) => e.group_id === group.id),
      store.settlements.filter((s) => s.group_id === group.id),
    );
    return {
      members: balances,
      transfers: simplifyDebts(balances),
      computed_at: new Date().toISOString(),
    };
  });
}

/** GET /g/{slug}/balances/{member_id} */
export async function getMemberBreakdown(slug: string, memberId: string): Promise<BreakdownLine[]> {
  return request("GET", `/g/${slug}/balances/${memberId}`, undefined, () => {
    const group = findGroup(slug);
    const store = load();
    const nameOf = (id: string) => group.members.find((m) => m.id === id)?.name ?? "Unknown";
    const lines: BreakdownLine[] = [];
    for (const e of store.expenses) {
      if (e.group_id !== group.id || e.deleted_at) continue;
      const paid = e.payers.find((p) => p.member_id === memberId);
      if (paid)
        lines.push({
          kind: "expense_paid",
          label: `Paid for "${e.description}"`,
          date: e.spent_on,
          amount_minor: paid.paid_minor,
        });
      const owed = e.splits.find((s) => s.member_id === memberId);
      if (owed)
        lines.push({
          kind: "expense_owed",
          label: `Share of "${e.description}"`,
          date: e.spent_on,
          amount_minor: -owed.owed_minor,
        });
    }
    for (const s of store.settlements) {
      if (s.group_id !== group.id || s.deleted_at) continue;
      if (s.from_member_id === memberId)
        lines.push({
          kind: "settlement_sent",
          label: `Paid ${nameOf(s.to_member_id)}`,
          date: s.settled_on,
          amount_minor: s.amount_minor,
        });
      if (s.to_member_id === memberId)
        lines.push({
          kind: "settlement_received",
          label: `Received from ${nameOf(s.from_member_id)}`,
          date: s.settled_on,
          amount_minor: -s.amount_minor,
        });
    }
    lines.sort((a, b) => b.date.localeCompare(a.date));
    return lines;
  });
}
