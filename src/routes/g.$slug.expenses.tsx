import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberDot, Money, memberName, memberOf } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useGroupContext } from "@/lib/group-context";
import * as api from "@/lib/mock-api";
import { expensesQuery, groupKeys } from "@/lib/queries";
import { ApiError } from "@/lib/types";

export const Route = createFileRoute("/g/$slug/expenses")({
  component: ExpensesPage,
});

const METHOD_LABEL: Record<string, string> = {
  equal: "Equally",
  exact: "Exact amounts",
  percent: "Percentages",
  shares: "Shares",
};

function ExpensesPage() {
  const { slug, group, openExpense } = useGroupContext();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [member, setMember] = useState("all");

  const filters = { q: q.trim() || undefined, member: member === "all" ? undefined : member };
  const { data, isPending } = useQuery(expensesQuery(slug, filters));

  const invalidate = () => groupKeys(slug).forEach((key) => void qc.invalidateQueries({ queryKey: key }));

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteExpense(slug, id),
    onSuccess: (_result, id) => {
      invalidate();
      toast("Expense deleted", {
        action: {
          label: "Undo",
          onClick: () => {
            void api.restoreExpense(slug, id).then(invalidate);
          },
        },
      });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not delete that expense."),
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search expenses"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={member} onValueChange={setMember}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {group.members
              .filter((m) => !m.removed_at)
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button onClick={() => openExpense()}>
          <Plus className="size-4" />
          New expense
        </Button>
      </div>

      {isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="grid gap-3 py-12 text-center">
            <p className="font-medium">No expenses here yet</p>
            <p className="text-sm text-muted-foreground">
              Add the first one and balances update straight away.
            </p>
            <Button className="justify-self-center" onClick={() => openExpense()}>
              <Plus className="size-4" />
              Add an expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {(data ?? []).map((e) => (
            <Card key={e.id}>
              <CardContent className="grid gap-3 py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.spent_on} · {METHOD_LABEL[e.split_method]} ·{" "}
                      {e.payers.map((p) => memberName(group, p.member_id)).join(" + ")} paid
                    </p>
                  </div>
                  <Money amountMinor={e.total_minor} group={group} tone="plain" className="font-semibold" />
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit expense"
                      onClick={() => openExpense(e.id)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete expense"
                      onClick={() => remove.mutate(e.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
                  {e.splits.map((s) => (
                    <span key={s.member_id} className="flex items-center gap-1.5 text-xs">
                      <MemberDot member={memberOf(group, s.member_id)} size="sm" />
                      {memberName(group, s.member_id)}
                      <Money amountMinor={s.owed_minor} group={group} tone="plain" className="text-muted-foreground" />
                    </span>
                  ))}
                </div>
                {e.notes ? <p className="text-xs text-muted-foreground">{e.notes}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
