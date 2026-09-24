import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, HandCoins, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MemberDot, Money, memberName, memberOf } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupContext } from "@/lib/group-context";
import * as api from "@/lib/mock-api";
import { groupKeys, settlementsQuery } from "@/lib/queries";
import { ApiError } from "@/lib/types";

export const Route = createFileRoute("/g/$slug/settlements")({
  component: SettlementsPage;
});

function SettlementsPage() {
  const { slug, group, openSettle } = useGroupContext();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(settlementsQuery(slug));

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteSettlement(slug, id),
    onSuccess: () => {
      groupKeys(slug).forEach((key) => void qc.invalidateQueries({ queryKey: key }));
      toast.success("Payment removed");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not remove that payment."),
  });

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Payments between people</h2>
          <p className="text-sm text-muted-foreground">
            Recorded here, paid however you like — cash, transfer, anything.
          </p>
        </div>
        <Button onClick={() => openSettle()}>
          <HandCoins className="size-4" />
          Record
        </Button>
      </div>

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">No payments yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use "Mark as paid" on the balances tab to log one in a tap.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(data ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
                <MemberDot member={memberOf(group, s.from_member_id)} size="sm" />
                <span className="font-medium">{memberName(group, s.from_member_id)}</span>
                <ArrowRight className="size-4 text-muted-foreground" />
                <MemberDot member={memberOf(group, s.to_member_id)} size="sm" />
                <span className="font-medium">{memberName(group, s.to_member_id)}</span>
                <span className="text-xs text-muted-foreground">
                  {s.settled_on}
                  {s.note ? ` · ${s.note}` : ""}
                </span>
                <Money
                  amountMinor={s.amount_minor}
                  group={group}
                  tone="plain"
                  className="ml-auto font-semibold"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove payment"
                  onClick={() => remove.mutate(s.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
