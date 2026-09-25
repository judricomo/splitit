"""Pydantic models mirroring the schemas in /openapi.yaml (and, in turn,
``frontend/src/lib/types.ts``).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

SplitMethod = Literal["equal", "exact", "percent", "shares"]


class Member(BaseModel):
    id: str
    name: str
    color: str
    removed_at: datetime | None = None


class Group(BaseModel):
    id: str
    slug: str
    name: str
    currency_code: str
    currency_exponent: int
    pin_required: bool
    archived_at: datetime | None = None
    created_at: datetime
    members: list[Member]
    version: int


class CreateGroupInput(BaseModel):
    name: str
    currency_code: str
    my_name: str
    member_names: list[str] = Field(default_factory=list)
    pin: str | None = None


class UpdateGroupInput(BaseModel):
    name: str | None = None


class AddMemberInput(BaseModel):
    name: str


class RenameMemberInput(BaseModel):
    name: str


class Payer(BaseModel):
    member_id: str
    paid_minor: int


class ParticipantInput(BaseModel):
    member_id: str
    exact_minor: int | None = None
    bp: int | None = None
    shares: int | None = None


class SplitInput(BaseModel):
    method: SplitMethod
    participants: list[ParticipantInput]


class SplitRow(BaseModel):
    member_id: str
    owed_minor: int
    is_rounding: bool = False
    input_bp: int | None = None
    input_shares: int | None = None
    input_exact_minor: int | None = None


class ExpenseInput(BaseModel):
    description: str
    total_minor: int
    spent_on: date
    notes: str | None = None
    payers: list[Payer]
    split: SplitInput


class Expense(BaseModel):
    id: str
    group_id: str
    description: str
    total_minor: int
    spent_on: date
    notes: str | None = None
    split_method: SplitMethod
    payers: list[Payer]
    splits: list[SplitRow]
    created_by_member_id: str
    created_at: datetime
    deleted_at: datetime | None = None
    version: int


class PreviewSplitInput(BaseModel):
    total_minor: int
    split: SplitInput
    payers: list[Payer]


class PreviewSplitResponse(BaseModel):
    splits: list[SplitRow]


class SettlementInput(BaseModel):
    from_member_id: str
    to_member_id: str
    amount_minor: int
    settled_on: date
    note: str | None = None


class Settlement(BaseModel):
    id: str
    group_id: str
    from_member_id: str
    to_member_id: str
    amount_minor: int
    settled_on: date
    note: str | None = None
    created_at: datetime
    deleted_at: datetime | None = None
    version: int


class BalanceRow(BaseModel):
    member_id: str
    paid: int
    owed: int
    sent: int
    received: int
    balance: int


class Transfer(BaseModel):
    from_: str = Field(alias="from")
    to: str
    amount_minor: int

    model_config = {"populate_by_name": True}


class BalancesResponse(BaseModel):
    members: list[BalanceRow]
    transfers: list[Transfer]
    computed_at: datetime


class BreakdownLine(BaseModel):
    kind: Literal["expense_paid", "expense_owed", "settlement_sent", "settlement_received"]
    label: str
    date: date
    amount_minor: int


class IdentityInput(BaseModel):
    member_id: str


class PinInput(BaseModel):
    pin: str = Field(min_length=4, max_length=8)


class ProblemDetail(BaseModel):
    status: int
    code: str
    title: str
