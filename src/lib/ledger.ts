// Pure ledger core: split computation, rounding, net balances and debt
// simplification. Integer maths only — mirrors the planned Python `ledger`
// package so the same golden tests apply on both sides.

import type {
  BalanceRow,
  Expense,
  Payer,
  Settlement,
  SplitInput,
  SplitRow,
  Transfer,
} from "./types";

/** The payer who absorbs leftover minor units: largest paid, ties -> lowest member id. */
export function primaryPayer(payers: Payer[]): string | null {
  const active = payers.filter((p) => p.paid_minor > 0);
  if (active.length === 0) return null;
  return [...active].sort(
    (a, b) => b.paid_minor - a.paid_minor || a.member_id.localeCompare(b.member_id),
  )[0]!.member_id;
}

export interface SplitResult {
  rows: SplitRow[];
  leftover_minor: number;
  error: string | null;
}

/** Spec §4.2 — floor each raw share, then the primary payer absorbs the remainder. */
export function computeSplits(totalMinor: number, split: SplitInput, payers: Payer[]): SplitResult {
  const parts = split.participants;
  if (totalMinor <= 0) return { rows: [], leftover_minor: 0, error: "Total must be greater than 0" };
  if (parts.length === 0) return { rows: [], leftover_minor: 0, error: "Pick at least one participant" };

  const rows: SplitRow[] = [];
  let error: string | null = null;

  if (split.method === "equal") {
    const n = parts.length;
    const base = Math.floor(totalMinor / n);
    for (const p of parts) {
      rows.push({ member_id: p.member_id, owed_minor: base, is_rounding: false });
    }
  } else if (split.method === "exact") {
    let sum = 0;
    for (const p of parts) {
      const amount = p.exact_minor ?? 0;
      sum += amount;
      rows.push({
        member_id: p.member_id,
        owed_minor: amount,
        is_rounding: false,
        input_exact_minor: amount,
      });
    }
    if (sum !== totalMinor) error = "Exact amounts must add up to the total";
  } else if (split.method === "percent") {
    let bpSum = 0;
    for (const p of parts) {
      const bp = p.bp ?? 0;
      bpSum += bp;
      rows.push({
        member_id: p.member_id,
        owed_minor: Math.floor((totalMinor * bp) / 10000),
        is_rounding: false,
        input_bp: bp,
      });
    }
    if (bpSum !== 10000) error = "Percentages must add up to 100.00%";
  } else {
    const total = parts.reduce((acc, p) => acc + (p.shares ?? 0), 0);
    if (total <= 0) {
      error = "Total shares must be at least 1";
    }
    for (const p of parts) {
      const s = p.shares ?? 0;
      rows.push({
        member_id: p.member_id,
        owed_minor: total > 0 ? Math.floor((totalMinor * s) / total) : 0,
        is_rounding: false,
        input_shares: s,
      });
    }
  }

  const assigned = rows.reduce((acc, r) => acc + r.owed_minor, 0);
  const leftover = totalMinor - assigned;

  if (!error && leftover !== 0 && split.method !== "exact") {
    const absorber = primaryPayer(payers);
    if (absorber) {
      const existing = rows.find((r) => r.member_id === absorber);
      if (existing) {
        existing.owed_minor += leftover;
      } else {
        rows.push({ member_id: absorber, owed_minor: leftover, is_rounding: true });
      }
    } else {
      rows[0]!.owed_minor += leftover;
    }
  }

  return { rows, leftover_minor: leftover, error };
}

export function validatePayers(totalMinor: number, payers: Payer[]): string | null {
  const active = payers.filter((p) => p.paid_minor > 0);
  if (active.length === 0) return "Add at least one payer";
  const sum = active.reduce((acc, p) => acc + p.paid_minor, 0);
  if (sum !== totalMinor) return "Paid amounts must add up to the total";
  return null;
}

/** Spec §4.3 — B = paid − owed + sent − received. Σ B is always 0. */
export function computeBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[],
): BalanceRow[] {
  const rows = new Map<string, BalanceRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { member_id: id, paid: 0, owed: 0, sent: 0, received: 0, balance: 0 };
      rows.set(id, r);
    }
    return r;
  };
  memberIds.forEach(row);

  for (const e of expenses) {
    if (e.deleted_at) continue;
    for (const p of e.payers) row(p.member_id).paid += p.paid_minor;
    for (const s of e.splits) row(s.member_id).owed += s.owed_minor;
  }
  for (const s of settlements) {
    if (s.deleted_at) continue;
    row(s.from_member_id).sent += s.amount_minor;
    row(s.to_member_id).received += s.amount_minor;
  }

  const result = [...rows.values()].map((r) => ({
    ...r,
    balance: r.paid - r.owed + r.sent - r.received,
  }));

  const sum = result.reduce((acc, r) => acc + r.balance, 0);
  if (sum !== 0) console.error("[ledger] invariant broken: Σ balances =", sum);

  return result;
}

/** Spec §4.4 — deterministic greedy simplification, at most n−1 transfers. */
export function simplifyDebts(balances: BalanceRow[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ id: b.member_id, amount: b.balance }));
  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ id: b.member_id, amount: -b.balance }));

  const bySize = (a: { id: string; amount: number }, b: { id: string; amount: number }) =>
    b.amount - a.amount || a.id.localeCompare(b.id);

  creditors.sort(bySize);
  debtors.sort(bySize);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]!;
    const d = debtors[di]!;
    const amount = Math.min(c.amount, d.amount);
    if (amount > 0) transfers.push({ from: d.id, to: c.id, amount_minor: amount });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) ci++;
    if (d.amount === 0) di++;
  }
  return transfers;
}
