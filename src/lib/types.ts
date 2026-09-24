// Shared domain types. These mirror the shapes the real FastAPI backend will
// return, so swapping the mock client for a generated OpenAPI client later is
// a drop-in change.

export type SplitMethod = "equal" | "exact" | "percent" | "shares";

export interface Member {
  id: string;
  name: string;
  color: string;
  removed_at: string | null;
}

export interface Group {
  id: string;
  slug: string;
  name: string;
  currency_code: string;
  currency_exponent: number;
  pin_required: boolean;
  archived_at: string | null;
  created_at: string;
  members: Member[];
  version: number;
}

export interface Payer {
  member_id: string;
  paid_minor: number;
}

/** Raw participant input as typed in the form (only one value field is used). */
export interface ParticipantInput {
  member_id: string;
  exact_minor?: number | undefined;
  bp?: number | undefined;
  shares?: number | undefined;
}

export interface SplitInput {
  method: SplitMethod;
  participants: ParticipantInput[];
}

/** Computed + stored share for one participant. */
export interface SplitRow {
  member_id: string;
  owed_minor: number;
  is_rounding: boolean;
  input_bp?: number | undefined;
  input_shares?: number | undefined;
  input_exact_minor?: number | undefined;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  total_minor: number;
  spent_on: string;
  notes: string | null;
  split_method: SplitMethod;
  payers: Payer[];
  splits: SplitRow[];
  created_by_member_id: string;
  created_at: string;
  deleted_at: string | null;
  version: number;
}

export interface Settlement {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_minor: number;
  settled_on: string;
  note: string | null;
  created_at: string;
  deleted_at: string | null;
  version: number;
}

export interface BalanceRow {
  member_id: string;
  paid: number;
  owed: number;
  sent: number;
  received: number;
  balance: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount_minor: number;
}

export interface BalancesResponse {
  members: BalanceRow[];
  transfers: Transfer[];
  computed_at: string;
}

export interface BreakdownLine {
  kind: "expense_paid" | "expense_owed" | "settlement_sent" | "settlement_received";
  label: string;
  date: string;
  amount_minor: number;
}

export interface ExpenseInput {
  description: string;
  total_minor: number;
  spent_on: string;
  notes?: string | null | undefined;
  payers: Payer[];
  split: SplitInput;
}

export interface SettlementInput {
  from_member_id: string;
  to_member_id: string;
  amount_minor: number;
  settled_on: string;
  note?: string | null | undefined;
}

export interface CreateGroupInput {
  name: string;
  currency_code: string;
  my_name: string;
  member_names: string[];
  pin?: string | null | undefined;
}

/** RFC 9457-ish problem detail, matching the planned API error shape. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
