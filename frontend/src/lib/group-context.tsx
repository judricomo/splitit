import { createContext, useContext, type ReactNode } from "react";

import type { Group } from "./types";

interface GroupContextValue {
  slug: string;
  group: Group;
  actorId: string | null;
  setActor: (memberId: string) => void;
  openExpense: (expenseId?: string) => void;
  openSettle: (prefill?: { from: string; to: string; amount_minor: number }) => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({
  value,
  children,
}: {
  value: GroupContextValue;
  children: ReactNode;
}) {
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroupContext() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error("useGroupContext must be used inside a group route");
  return ctx;
}
