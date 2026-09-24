import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Pencil, Plus, UserMinus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberDot, Money } from "@/components/member-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGroupContext } from "@/lib/group-context";
import * as api from "@/lib/mock-api";
import { balancesQuery, groupKeys } from "@/lib/queries";
import { ApiError } from "@/lib/types";

export const Route = createFileRoute("/g/$slug/people")({
  component: PeoplePage,
});

function PeoplePage() {
  const { slug, group, actorId, setActor } = useGroupContext();
  const qc = useQueryClient();
  const { data: balances } = useQuery(balancesQuery(slug));
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const invalidate = () => groupKeys(slug).forEach((key) => void qc.invalidateQueries({ queryKey: key }));
  const onError = (error: unknown) =>
    toast.error(error instanceof ApiError ? error.message : "Something went wrong. Try again.");

  const add = useMutation({
    mutationFn: () => api.addMember(slug, newName),
    onSuccess: () => {
      setNewName("");
      invalidate();
      toast.success("Person added");
    },
    onError,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.renameMember(slug, id, name),
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      toast.success("Name updated");
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.removeMember(slug, id),
    onSuccess: () => {
      invalidate();
      toast.success("Person removed");
    },
    onError,
  });

  const active = group.members.filter((m) => !m.removed_at);
  const removed = group.members.filter((m) => m.removed_at);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People in this group</CardTitle>
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
                      aria-label="Save name"
                      onClick={() => rename.mutate({ id: m.id, name: editName })}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel"
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
                          <span className="ml-2 text-xs text-primary">that's you</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {balance === 0 ? "settled up" : balance > 0 ? "gets back" : "owes"}{" "}
                        {balance !== 0 ? (
                          <Money amountMinor={balance} group={group} abs tone="plain" />
                        ) : null}
                      </p>
                    </div>
                    {m.id !== actorId ? (
                      <Button size="sm" variant="ghost" onClick={() => setActor(m.id)}>
                        I am {m.name}
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Rename"
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
                      aria-label="Remove"
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
              placeholder="Add someone"
              maxLength={40}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) add.mutate();
              }}
            />
            <Button disabled={!newName.trim() || add.isPending} onClick={() => add.mutate()}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Someone can only be removed once their balance is zero. Their past expenses stay.
          </p>
        </CardContent>
      </Card>

      {removed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No longer in the group</CardTitle>
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
