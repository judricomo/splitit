"""SQLAlchemy ORM tables backing the domain models in ``models.py``.

Kept deliberately simple/portable: plain columns with SQLAlchemy's generic
types (``String``, ``Integer``, ``Date``, ``DateTime``, ``JSON``), no
dialect-specific types, so the same schema works unchanged against SQLite
today and Postgres (or any other SQLAlchemy dialect) later.

Payers and split rows are stored as JSON on the expense row rather than as
separate tables — they're small, always read/written as a whole alongside
their parent expense, and never queried independently, so normalizing them
further would add joins without a real benefit.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class GroupRow(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    currency_code: Mapped[str] = mapped_column(String)
    currency_exponent: Mapped[int] = mapped_column(Integer)
    pin_required: Mapped[bool] = mapped_column(Boolean, default=False)
    pin_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)

    members: Mapped[list["MemberRow"]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="MemberRow.order_index",
    )


class MemberRow(Base):
    __tablename__ = "members"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(String, ForeignKey("groups.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String)
    color: Mapped[str] = mapped_column(String)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    group: Mapped["GroupRow"] = relationship(back_populates="members")


class ExpenseRow(Base):
    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(String)
    total_minor: Mapped[int] = mapped_column(Integer)
    spent_on: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    split_method: Mapped[str] = mapped_column(String)
    payers: Mapped[list] = mapped_column(JSON)
    splits: Mapped[list] = mapped_column(JSON)
    created_by_member_id: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)


class SettlementRow(Base):
    __tablename__ = "settlements"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    from_member_id: Mapped[str] = mapped_column(String)
    to_member_id: Mapped[str] = mapped_column(String)
    amount_minor: Mapped[int] = mapped_column(Integer)
    settled_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
