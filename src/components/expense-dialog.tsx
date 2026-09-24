import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberDot, Money } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { computeSplits, validatePayers } from "@/lib/ledger";
import * as api from "@/lib/mock-api";
import {
  basisPointsToInput,
  minorToInput,
  parseToBasisPoints,
  parseToMinor,
} from "@/lib/money";
import { groupKeys } from "@/lib/queries";
import { ApiError, type Expense, type Group, type SplitMethod } from "@/lib/types";

const METHODS: { value: SplitMethod; label: string; hint: string }[] = [
  { value: "equal", label: "Equally", hint: "Split evenly between everyone selected." },
  { value: "exact", label: "Exact", hint: "Type each person's exact amount." },
  { value: "percent", label: "Percent", hint: "Percentages must add up to 100%." },
  { value: "shares", label: "Shares", hint: "Weights, e.g. 2:1:1 for a bigger room." },
];

type ValueMap = Record<string, string>;

export function ExpenseDialog({
  slug,
  group,
  actorId,
  expense,
  open,
  onOpenChange,
}: {
  slug: string;
  group: Group;
  actorId: string | null;
  expense?: Expense | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const exp = group.currency_exponent;
  const active = useMemo(() => group.members.filter((m) => !m.removed_at), [group.members]);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<SplitMethod>("equal");
  const [participants, setParticipants] = useState<string[]>([]);
  const [multiPayer, setMultiPayer] = useState(false);
  const [payerAmounts, setPayerAmounts] = useState<ValueMap>({});
  const [singlePayer, setSinglePayer] = useState<string>("");
  const [exact, setExact] = useState<ValueMap>({});
  const [percent, setPercent] = useState<ValueMap>({});
  const [shares, setShares] = useState<ValueMap>({});

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (expense) {
      setDescription(expense.description);
      setAmount(minorToInput(expense.total_minor, exp));
      setSpentOn(expense.spent_on);
      setNotes(expense.notes ?? "");
      setMethod(expense.split_method);
      setParticipants(expense.splits.filter((s) => !s.is_rounding).map((s) => s.member_id));
      setMultiPayer(expense.payers.length > 1);
      setSinglePayer(expense.payers[0]?.member_id ?? actorId ?? active[0]?.id ?? "");
      setPayerAmounts(
        Object.fromEntries(expense.payers.map((p) => [p.member_id, minorToInput(p.paid_minor, exp)])),
      );
      setExact(
        Object.fromEntries(
          expense.splits.map((s) => [s.member_id, minorToInput(s.input_exact_minor ?? s.owed_minor, exp)]),
        ),
      );
      setPercent(
        Object.fromEntries(expense.splits.map((s) => [s.member_id, basisPointsToInput(s.input_bp ?? 0)])),
      );
      setShares(
        Object.fromEntries(expense.splits.map((s) => [s.member_id, String(s.input_shares ?? 1)])),
      );
    } else {
      setDescription("");
      setAmount("");
      setSpentOn(new Date().toISOString().slice(0, 10));
      setNotes("");
      setMethod("equal");
      setParticipants(active.map((m) => m.id));
      setMultiPayer(false);
      setSinglePayer(actorId ?? active[0]?.id ?? "");
      setPayerAmounts({});
      setExact({});
      setPercent({});
      setShares(Object.fromEntries(active.map((m) => [m.id, "1"])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const totalMinor = parseToMinor(amount, exp) ?? 0;

  const payers = useMemo(() => {
    if (!multiPayer) return singlePayer ? [{ member_id: singlePayer, paid_minor: totalMinor }] : [];
    return active
      .map((m) => ({ member_id: m.id, paid_minor: parseToMinor(payerAmounts[m.id] ?? "", exp) ?? 0 }))
      .filter((p) => p.paid_minor > 0);
  }, [multiPayer, singlePayer, totalMinor, active, payerAmounts, exp]);

  const splitInput = useMemo(
    () => ({
      method,
      participants: participants.map((id) => ({
        member_id: id,
        exact_minor: parseToMinor(exact[id] ?? "", exp) ?? 0,
        bp: parseToBasisPoints(percent[id] ?? "") ?? 0,
        shares: Number(shares[id] ?? 0) || 0,
      })),
    }),
    [method, participants, exact, percent, shares, exp],
  );

  const preview = useMemo(
    () => computeSplits(totalMinor, splitInput, payers),
    [totalMinor, splitInput, payers],
  );

  const payerError = totalMinor > 0 ? validatePayers(totalMinor, payers) : "Enter an amount";
  const assigned = preview.rows.reduce((acc, r) => acc + r.owed_minor, 0);
  const remaining = totalMinor - assigned;
  const remainingBp = 10000 - participants.reduce((acc, id) => acc + (parseToBasisPoints(percent[id] ?? "") ?? 0), 0);

  const canSave =
    description.trim().length > 0 && totalMinor > 0 && !payerError && !preview.error && participants.length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const input = {
        description,
        total_minor: totalMinor,
        spent_on: spentOn,
        notes,
        payers,
        split: splitInput,
      };
      if (expense) return api.updateExpense(slug, expense.id, input);
      return api.createExpense(slug, input, actorId ?? "");
    },
    onSuccess: () => {
      groupKeys(slug).forEach((key) => void qc.invalidateQueries({ queryKey: key }));
      toast.success(expense ? "Expense updated" : "Expense added");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Try again.");
    },
  });

  const toggleParticipant = (id: string) =>
    setParticipants((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "New expense"}</DialogTitle>
          <DialogDescription>
            Amounts are in {group.currency_code}. Anyone in the group can edit this later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
            <div className="grid gap-2">
              <Label htmlFor="description">What was it for?</Label>
              <Input
                id="description"
                value={description}
                maxLength={120}
                placeholder="Dinner at La Cevichería"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Total</Label>
              <Input
                id="amount"
                className="money sm:w-36"
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                className="sm:w-40"
                value={spentOn}
                onChange={(e) => setSpentOn(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Who paid?</p>
                <p className="text-xs text-muted-foreground">
                  {multiPayer ? "Amounts must add up to the total." : "One person covered it."}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Several payers
                <Switch checked={multiPayer} onCheckedChange={setMultiPayer} />
              </label>
            </div>

            {!multiPayer ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {active.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSinglePayer(m.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      singlePayer === m.id
                        ? "border-primary bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <MemberDot member={m} size="sm" />
                    {m.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                {active.map((m) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <MemberDot member={m} size="sm" />
                    <span className="flex-1 text-sm">{m.name}</span>
                    <Input
                      className="money w-32"
                      inputMode="decimal"
                      placeholder="0"
                      value={payerAmounts[m.id] ?? ""}
                      onChange={(e) => setPayerAmounts((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                  </div>
                ))}
                {payerError && totalMinor > 0 ? (
                  <p className="text-xs text-negative">{payerError}</p>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">How is it split?</p>
            <Tabs value={method} onValueChange={(v) => setMethod(v as SplitMethod)} className="mt-3">
              <TabsList className="w-full">
                {METHODS.map((m) => (
                  <TabsTrigger key={m.value} value={m.value} className="flex-1">
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="mt-2 text-xs text-muted-foreground">
              {METHODS.find((m) => m.value === method)!.hint}
            </p>

            <div className="mt-4 grid gap-2">
              {active.map((m) => {
                const checked = participants.includes(m.id);
                const share = preview.rows.find((r) => r.member_id === m.id);
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${checked ? "" : "opacity-55"}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleParticipant(m.id)}
                      aria-label={`Include ${m.name}`}
                    />
                    <MemberDot member={m} size="sm" />
                    <span className="flex-1 text-sm">{m.name}</span>

                    {checked && method === "exact" ? (
                      <Input
                        className="money w-28"
                        inputMode="decimal"
                        placeholder="0"
                        value={exact[m.id] ?? ""}
                        onChange={(e) => setExact((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                    ) : null}
                    {checked && method === "percent" ? (
                      <div className="flex items-center gap-1">
                        <Input
                          className="money w-20"
                          inputMode="decimal"
                          placeholder="0"
                          value={percent[m.id] ?? ""}
                          onChange={(e) => setPercent((p) => ({ ...p, [m.id]: e.target.value }))}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    ) : null}
                    {checked && method === "shares" ? (
                      <Input
                        className="money w-20"
                        inputMode="numeric"
                        placeholder="1"
                        value={shares[m.id] ?? ""}
                        onChange={(e) =>
                          setShares((p) => ({ ...p, [m.id]: e.target.value.replace(/\D/g, "") }))
                        }
                      />
                    ) : null}

                    <span className="w-28 text-right text-sm">
                      {checked || share ? (
                        <Money amountMinor={share?.owed_minor ?? 0} group={group} tone="plain" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
              {method === "percent" ? (
                <span className={remainingBp === 0 ? "text-muted-foreground" : "text-negative"}>
                  {remainingBp === 0
                    ? "100% assigned"
                    : `${basisPointsToInput(Math.abs(remainingBp))}% ${remainingBp > 0 ? "left to assign" : "over"}`}
                </span>
              ) : (
                <span className={remaining === 0 ? "text-muted-foreground" : "text-negative"}>
                  {remaining === 0 ? "Fully assigned" : "Remaining to assign"}{" "}
                  {remaining !== 0 ? (
                    <Money amountMinor={remaining} group={group} abs tone="plain" />
                  ) : null}
                </span>
              )}
              {preview.rows.some((r) => r.is_rounding) ? (
                <span className="text-muted-foreground">
                  Leftover cents go to the person who paid most.
                </span>
              ) : null}
            </div>
            {preview.error ? <p className="mt-2 text-xs text-negative">{preview.error}</p> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything worth remembering"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : expense ? "Save changes" : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
