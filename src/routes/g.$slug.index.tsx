import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, HandCoins, Sparkles } from "lucide-react";
import { useState } from "react";

import { MemberDot, Money, memberName, memberOf } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupContext } from "@/lib/group-context";
import { balancesQuery, breakdownQuery } from "@/lib/queries";

export const Route = createFileRoute("/g/$slug/")({
  component: BalancesPage,
});

function BalancesPage() {
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
            <CardTitle className="text-base">Your part</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You're square with everyone. Nothing to pay or collect.
              </p>
            ) : (
              mine.map((t, i) => {
                const youPay = t.from === actorId;
                const other = memberName(group, youPay ? t.to : t.from);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">
                      {youPay ? `You owe ${other}` : `${other} owes you`}
                    </span>
                    <Money amountMinor={youPay ? -t.amount_minor : t.amount_minor} group={group} abs />
                    {youPay ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="ml-auto"
                        onClick={() => openSettle({ from: t.from, to: t.to, amount_minor: t.amount_minor })}
                      >
                        <HandCoins className="size-4" />
                        Mark as paid
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
          <CardTitle className="text-base">Where everyone stands</CardTitle>
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
                    {row.balance > 0 ? "gets back" : row.balance < 0 ? "owes" : "settled up"}
                  </p>
                </div>
                <Money amountMinor={row.balance} group={group} abs={row.balance !== 0} className="text-sm font-semibold" />
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Shortest way to settle up
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {allSettled ? (
            <p className="text-sm text-muted-foreground">
              Nobody owes anybody. Add an expense to get going.
            </p>
          ) : (
            data.transfers.map((t, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
              >
                <MemberDot member={memberOf(group, t.from)} size="sm" />
                <span className="font-medium">{memberName(group, t.from)}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <MemberDot member={memberOf(group, t.to)} size="sm" />
                <span className="font-medium">{memberName(group, t.to)}</span>
                <Money amountMinor={t.amount_minor} group={group} tone="plain" className="ml-auto font-semibold" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openSettle({ from: t.from, to: t.to, amount_minor: t.amount_minor })}
                >
                  Mark as paid
                </Button>
              </div>
            ))
          )}
          <p className="pt-1 text-xs text-muted-foreground">
            {data.transfers.length} payment{data.transfers.length === 1 ? "" : "s"} instead of everyone
            paying everyone.
          </p>
        </CardContent>
      </Card>

      <BreakdownDialog memberId={openMember} onClose={() => setOpenMember(null)} />
    </div>
  );
}

function BreakdownDialog({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
  const { slug, group } = useGroupContext();
  const { data, isPending } = useQuery({
    ...breakdownQuery(slug, memberId ?? ""),
    enabled: Boolean(memberId),
  });

  return (
    <Dialog open={Boolean(memberId)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{memberId ? memberName(group, memberId) : ""}'s history</DialogTitle>
        </DialogHeader>
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid gap-1">
            {(data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              (data ?? []).map((line, i) => (
                <div key={i} className="flex items-center gap-3 border-b py-2 text-sm last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{line.label}</p>
                    <p className="text-xs text-muted-foreground">{line.date}</p>
                  </div>
                  <Money amountMinor={line.amount_minor} group={group} signed />
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
