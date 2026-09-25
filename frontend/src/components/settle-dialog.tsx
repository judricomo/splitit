import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MemberDot } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { translateApiError } from "@/lib/api-errors";
import * as api from "@/lib/mock-api";
import { minorToInput, parseToMinor } from "@/lib/money";
import { groupKeys } from "@/lib/queries";
import type { Group } from "@/lib/types";

export interface SettlePrefill {
  from: string;
  to: string;
  amount_minor: number;
}

export function SettleDialog({
  slug,
  group,
  prefill,
  open,
  onOpenChange,
}: {
  slug: string;
  group: Group;
  prefill?: SettlePrefill | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const exp = group.currency_exponent;
  const active = group.members.filter((m) => !m.removed_at);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [settledOn, setSettledOn] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setFrom(prefill?.from ?? active[0]?.id ?? "");
    setTo(prefill?.to ?? active[1]?.id ?? "");
    setAmount(prefill ? minorToInput(prefill.amount_minor, exp) : "");
    setSettledOn(new Date().toISOString().slice(0, 10));
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill?.from, prefill?.to, prefill?.amount_minor]);

  const amountMinor = parseToMinor(amount, exp) ?? 0;
  const valid = from && to && from !== to && amountMinor > 0;

  const mutation = useMutation({
    mutationFn: () =>
      api.createSettlement(slug, {
        from_member_id: from,
        to_member_id: to,
        amount_minor: amountMinor,
        settled_on: settledOn,
        note,
      }),
    onSuccess: () => {
      groupKeys(slug).forEach((key) => void qc.invalidateQueries({ queryKey: key }));
      toast.success(t("settleDialog.recordedToast"));
      onOpenChange(false);
    },
    onError: (error) => toast.error(translateApiError(t, error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settleDialog.title")}</DialogTitle>
          <DialogDescription>{t("settleDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t("settleDialog.whoPaidLabel")}</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder={t("settleDialog.pickPersonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {active.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <MemberDot member={m} size="sm" />
                      {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>{t("settleDialog.whoReceivedLabel")}</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder={t("settleDialog.pickPersonPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {active
                  .filter((m) => m.id !== from)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <MemberDot member={m} size="sm" />
                        {m.name}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="settle-amount">
                {t("settleDialog.amountLabel", { currency: group.currency_code })}
              </Label>
              <Input
                id="settle-amount"
                className="money"
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="settle-date">{t("common.date")}</Label>
              <Input
                id="settle-date"
                type="date"
                value={settledOn}
                onChange={(e) => setSettledOn(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="settle-note">{t("settleDialog.noteLabel")}</Label>
            <Input
              id="settle-note"
              value={note}
              placeholder={t("settleDialog.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t("common.saving") : t("settleDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
