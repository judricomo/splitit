import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, HandCoins, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MemberDot, Money, memberName, memberOf } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupContext } from "@/lib/group-context";
import { balancesQuery, breakdownQuery } from "@/lib/queries";
import type { BreakdownLine } from "@/lib/types";

export const Route = createFileRoute("/g/$slug/")({
  component: BalancesPage,
});

function BalancesPage() {
  const { t } = useTranslation();
  const { slug, group, actorId, openSettle } = useGroupContext();
  const { data, isPending } = useQuery(balancesQuery(slug));
  const [openMember, setOpenMember] = useState<string | null>(null);

  if (isPending || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const rows = [...data.members].sort((a, b) => b.balance - a.balance);
  const mine = data.transfers.filter((t) => t.from === actorId || t.to === actorId);
  const allSettled = data.transfers.length === 0;

  return (
    <div className="grid gap-6">
      {actorId ? (
        <Card className="border-primary/25 bg-accent/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("balances.yourPart.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("balances.yourPart.allSettled")}</p>
            ) : (
              mine.map((tr, i) => {
                const youPay = tr.from === actorId;
                const other = memberName(group, youPay ? tr.to : tr.from);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {youPay
                        ? t("balances.youOwe", { name: other })
                        : t("balances.owesYou", { name: other })}
                    </span>
                    <Money
                      amountMinor={youPay ? -tr.amount_minor : tr.amount_minor}
                      group={group}
                      abs
                    />
                    {youPay ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="ml-auto"
                        onClick={() =>
                          openSettle({ from: tr.from, to: tr.to, amount_minor: tr.amount_minor })
                        }
                      >
                        <HandCoins className="size-4" />
                        {t("balances.markAsPaid")}
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("balances.standings.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          {rows.map((row) => {
            const member = memberOf(group, row.member_id);
            return (
              <button
                key={row.member_id}
                type="button"
                onClick={() => setOpenMember(row.member_id)}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <MemberDot member={member} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{member?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.balance > 0
                      ? t("balances.status.getsBack")
                      : row.balance < 0
                        ? t("balances.status.owes")
                        : t("balances.status.settledUp")}
                  </p>
                </div>
                <Money
                  amountMinor={row.balance}
                  group={group}
                  abs={row.balance !== 0}
                  className="text-sm font-semibold"
                />
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            {t("balances.shortest.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {allSettled ? (
            <p className="text-sm text-muted-foreground">{t("balances.shortest.allSettled")}</p>
          ) : (
            data.transfers.map((tr, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
              >
                <MemberDot member={memberOf(group, tr.from)} size="sm" />
                <span className="font-medium">{memberName(group, tr.from)}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <MemberDot member={memberOf(group, tr.to)} size="sm" />
                <span className="font-medium">{memberName(group, tr.to)}</span>
                <Money
                  amountMinor={tr.amount_minor}
                  group={group}
                  tone="plain"
                  className="ml-auto font-semibold"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    openSettle({ from: tr.from, to: tr.to, amount_minor: tr.amount_minor })
                  }
                >
                  {t("balances.markAsPaid")}
                </Button>
              </div>
            ))
          )}
          <p className="pt-1 text-xs text-muted-foreground">
            {t("balances.shortest.count", { count: data.transfers.length })}
          </p>
        </CardContent>
      </Card>

      <BreakdownDialog memberId={openMember} onClose={() => setOpenMember(null)} />
    </div>
  );
}

/** Extracts the quoted description or the other member's name out of the server's English label. */
function breakdownSubject(line: BreakdownLine): string {
  if (line.kind === "expense_paid" || line.kind === "expense_owed") {
    return line.label.match(/"(.*)"/)?.[1] ?? line.label;
  }
  if (line.kind === "settlement_sent") return line.label.replace(/^Paid /, "");
  return line.label.replace(/^Received from /, "");
}

function BreakdownDialog({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { slug, group } = useGroupContext();
  const { data, isPending } = useQuery({
    ...breakdownQuery(slug, memberId ?? ""),
    enabled: Boolean(memberId),
  });

  return (
    <Dialog open={Boolean(memberId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("balances.breakdown.title", { name: memberId ? memberName(group, memberId) : "" })}
          </DialogTitle>
        </DialogHeader>
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid gap-1">
            {(data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("balances.breakdown.empty")}</p>
            ) : (
              (data ?? []).map((line, i) => {
                const subject = breakdownSubject(line);
                const key =
                  line.kind === "expense_paid"
                    ? "balances.breakdown.expensePaid"
                    : line.kind === "expense_owed"
                      ? "balances.breakdown.expenseOwed"
                      : line.kind === "settlement_sent"
                        ? "balances.breakdown.settlementSent"
                        : "balances.breakdown.settlementReceived";
                const isExpense = line.kind === "expense_paid" || line.kind === "expense_owed";
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b py-2 text-sm last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {t(key, isExpense ? { description: subject } : { name: subject })}
                      </p>
                      <p className="text-xs text-muted-foreground">{line.date}</p>
                    </div>
                    <Money amountMinor={line.amount_minor} group={group} signed />
                  </div>
                );
              })
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
