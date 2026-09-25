import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Lock, LockOpen, Pencil, Plus, UserMinus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { MemberDot, Money } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { translateApiError } from "@/lib/api-errors";
import { useGroupContext } from "@/lib/group-context";
import * as api from "@/lib/mock-api";
import { balancesQuery, groupKeys } from "@/lib/queries";

export const Route = createFileRoute("/g/$slug/people")({
  component: PeoplePage,
});

function PeoplePage() {
  const { t } = useTranslation();
  const { slug, group, actorId, setActor } = useGroupContext();
  const qc = useQueryClient();
  const { data: balances } = useQuery(balancesQuery(slug));
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pinEditing, setPinEditing] = useState(false);
  const [pinValue, setPinValue] = useState("");

  const invalidate = () =>
    groupKeys(slug).forEach((key) => void qc.invalidateQueries({ queryKey: key }));
  const onError = (error: unknown) => toast.error(translateApiError(t, error));

  const add = useMutation({
    mutationFn: () => api.addMember(slug, newName),
    onSuccess: () => {
      setNewName("");
      invalidate();
      toast.success(t("people.addedToast"));
    },
    onError,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameMember(slug, id, name),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      toast.success(t("people.renamedToast"));
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.removeMember(slug, id),
    onSuccess: () => {
      invalidate();
      toast.success(t("people.removedToast"));
    },
    onError,
  });

  const setPin = useMutation({
    mutationFn: async (pin: string) => {
      await api.updateGroup(slug, { pin });
      // Make sure this browser doesn't get locked out of its own group —
      // set/change the session cookie for the new PIN right away.
      await api.verifyPin(slug, pin);
    },
    onSuccess: () => {
      setPinEditing(false);
      setPinValue("");
      invalidate();
      toast.success(group.pin_required ? t("people.pin.updatedToast") : t("people.pin.setToast"));
    },
    onError,
  });

  const removePin = useMutation({
    mutationFn: () => api.updateGroup(slug, { remove_pin: true }),
    onSuccess: () => {
      invalidate();
      toast.success(t("people.pin.removedToast"));
    },
    onError,
  });

  const active = group.members.filter((m) => !m.removed_at);
  const removed = group.members.filter((m) => m.removed_at);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {group.pin_required ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
            {t("people.pin.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {group.pin_required ? t("people.pin.onDescription") : t("people.pin.offDescription")}
          </p>
          {pinEditing ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                inputMode="numeric"
                placeholder={t("people.pin.placeholder")}
                maxLength={8}
                className="max-w-40"
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pinValue.trim()) setPin.mutate(pinValue.trim());
                }}
              />
              <Button
                disabled={!pinValue.trim() || setPin.isPending}
                onClick={() => setPin.mutate(pinValue.trim())}
              >
                {t("common.save")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPinEditing(false);
                  setPinValue("");
                }}
              >
                {t("common.cancel")}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPinEditing(true)}>
                {group.pin_required ? t("people.pin.changeButton") : t("people.pin.setButton")}
              </Button>
              {group.pin_required ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removePin.isPending}
                  onClick={() => removePin.mutate()}
                >
                  {t("people.pin.removeButton")}
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("people.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          {active.map((m) => {
            const balance = balances?.members.find((b) => b.member_id === m.id)?.balance ?? 0;
            const isEditing = editingId === m.id;
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <MemberDot member={m} />
                {isEditing ? (
                  <>
                    <Input
                      className="h-9 flex-1"
                      value={editName}
                      maxLength={40}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("common.save")}
                      onClick={() => rename.mutate({ id: m.id, name: editName })}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("common.cancel")}
                      onClick={() => setEditingId(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {m.name}
                        {m.id === actorId ? (
                          <span className="ml-2 text-xs text-primary">{t("people.thatsYou")}</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {balance === 0
                          ? t("balances.status.settledUp")
                          : balance > 0
                            ? t("balances.status.getsBack")
                            : t("balances.status.owes")}{" "}
                        {balance !== 0 ? (
                          <Money amountMinor={balance} group={group} abs tone="plain" />
                        ) : null}
                      </p>
                    </div>
                    {m.id !== actorId ? (
                      <Button size="sm" variant="ghost" onClick={() => setActor(m.id)}>
                        {t("people.iAmButton", { name: m.name })}
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("people.renameAria")}
                      onClick={() => {
                        setEditingId(m.id);
                        setEditName(m.name);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("people.removeAria")}
                      onClick={() => remove.mutate(m.id)}
                    >
                      <UserMinus className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}

          <div className="mt-3 flex gap-2 border-t pt-4">
            <Input
              placeholder={t("people.addPlaceholder")}
              maxLength={40}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) add.mutate();
              }}
            />
            <Button disabled={!newName.trim() || add.isPending} onClick={() => add.mutate()}>
              <Plus className="size-4" />
              {t("common.add")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("people.removeHint")}</p>
        </CardContent>
      </Card>

      {removed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("people.removedHeading")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {removed.map((m) => (
              <span key={m.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                <MemberDot member={m} size="sm" />
                {m.name}
              </span>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
