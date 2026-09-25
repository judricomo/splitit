import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Check, Link2, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ExpenseDialog } from "@/components/expense-dialog";
import { LanguageToggle } from "@/components/language-toggle";
import { MemberDot, memberOf } from "@/components/member-bits";
import { SettleDialog, type SettlePrefill } from "@/components/settle-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { translateApiError } from "@/lib/api-errors";
import { GroupProvider } from "@/lib/group-context";
import * as api from "@/lib/mock-api";
import { expensesQuery, groupQuery } from "@/lib/queries";
import { ApiError } from "@/lib/types";

export const Route = createFileRoute("/g/$slug")({
  head: () => ({
    meta: [
      { title: "Your group — SplitIt" },
      { name: "description", content: "Shared expenses, balances and who owes whom." },
      { property: "og:title", content: "Your group — SplitIt" },
      { property: "og:description", content: "Shared expenses, balances and who owes whom." },
    ],
  }),
  component: GroupLayout,
});

const TABS = [
  { to: "/g/$slug", labelKey: "group.tabs.balances", exact: true },
  { to: "/g/$slug/expenses", labelKey: "group.tabs.expenses", exact: false },
  { to: "/g/$slug/settlements", labelKey: "group.tabs.payments", exact: false },
  { to: "/g/$slug/people", labelKey: "group.tabs.people", exact: false },
] as const;

function GroupLayout() {
  const { slug } = Route.useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: group, isPending, isError, error } = useQuery(groupQuery(slug));

  const [actorId, setActorId] = useState<string | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [settleOpen, setSettleOpen] = useState(false);
  const [prefill, setPrefill] = useState<SettlePrefill | null>(null);
  const [copied, setCopied] = useState(false);
  const [pin, setPin] = useState("");

  const { data: expenses } = useQuery({ ...expensesQuery(slug), enabled: Boolean(group) });

  useEffect(() => {
    const stored = api.getIdentity(slug);
    setActorId(stored);
    if (!stored && group) setIdentityOpen(true);
  }, [slug, group]);

  const pickActor = (memberId: string) => {
    setActorId(memberId);
    setIdentityOpen(false);
    void api.setIdentity(slug, memberId);
  };

  const pinRequired = isError && error instanceof ApiError && error.code === "PIN_REQUIRED";

  const pinMutation = useMutation({
    mutationFn: (value: string) => api.verifyPin(slug, value),
    onSuccess: () => {
      setPin("");
      void qc.invalidateQueries({ queryKey: ["group", slug] });
    },
    onError: (err) => {
      toast.error(translateApiError(t, err));
    },
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/g/${slug}`);
      setCopied(true);
      toast.success(t("group.header.copiedToast"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("group.header.copyErrorToast"));
    }
  };

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-5 py-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (pinRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 text-center">
        <form
          className="w-full max-w-sm text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.trim()) pinMutation.mutate(pin.trim());
          }}
        >
          <h1 className="text-2xl font-semibold">{t("group.pin.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("group.pin.description")}</p>
          <Input
            autoFocus
            inputMode="numeric"
            className="mt-6"
            placeholder={t("group.pin.placeholder")}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <Button
            type="submit"
            className="mt-4 w-full"
            disabled={pinMutation.isPending || !pin.trim()}
          >
            {pinMutation.isPending ? t("common.checking") : t("group.pin.submit")}
          </Button>
        </form>
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="flex min-h-screen items-center justify-center px-5 text-center">
        <div>
          <h1 className="text-2xl font-semibold">{t("group.notFound.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("group.notFound.description")}</p>
          <Button asChild className="mt-6">
            <Link to="/">{t("group.notFound.cta")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const me = memberOf(group, actorId);
  const activeMembers = group.members.filter((m) => !m.removed_at);
  const editing = expenses?.find((e) => e.id === editingId) ?? null;

  return (
    <GroupProvider
      value={{
        slug,
        group,
        actorId,
        setActor: pickActor,
        openExpense: (expenseId) => {
          setEditingId(expenseId);
          setExpenseOpen(true);
        },
        openSettle: (p) => {
          setPrefill(p ?? null);
          setSettleOpen(true);
        },
      }}
    >
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-5 py-3">
            <Link to="/" className="font-display text-base font-semibold">
              Split<span className="text-primary">It</span>
            </Link>
            <span className="text-muted-foreground">/</span>
            <div className="mr-auto min-w-0">
              <p className="truncate font-medium">{group.name}</p>
              <p className="text-xs text-muted-foreground">
                {t("group.header.peopleCount", {
                  count: activeMembers.length,
                  currency: group.currency_code,
                })}
              </p>
            </div>

            <Button variant="ghost" size="sm" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
              <span className="hidden sm:inline">{t("group.header.shareLink")}</span>
            </Button>
            <LanguageToggle />
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-2">
                  {me ? <MemberDot member={me} size="sm" /> : <Users className="size-4" />}
                  <span className="max-w-24 truncate">
                    {me?.name ?? t("group.header.iAmPlaceholder")}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("group.header.switchWho")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {activeMembers.map((m) => (
                  <DropdownMenuItem key={m.id} onClick={() => pickActor(m.id)}>
                    <MemberDot member={m} size="sm" />
                    {m.name}
                    {m.id === actorId ? <Check className="ml-auto size-4" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              onClick={() => {
                setEditingId(undefined);
                setExpenseOpen(true);
              }}
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">{t("group.header.expenseButton")}</span>
            </Button>
          </div>

          <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
            {TABS.map((tab) => {
              const href = tab.to.replace("$slug", slug);
              const isActive = tab.exact
                ? pathname === href || pathname === `${href}/`
                : pathname.startsWith(href);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  params={{ slug }}
                  className={`border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(tab.labelKey)}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-5xl px-5 py-7">
          <Outlet />
        </main>

        <ExpenseDialog
          slug={slug}
          group={group}
          actorId={actorId}
          expense={editing}
          open={expenseOpen}
          onOpenChange={(open) => {
            setExpenseOpen(open);
            if (!open) {
              setEditingId(undefined);
              void qc.invalidateQueries({ queryKey: ["expenses", slug] });
            }
          }}
        />
        <SettleDialog
          slug={slug}
          group={group}
          prefill={prefill}
          open={settleOpen}
          onOpenChange={setSettleOpen}
        />

        <Dialog open={identityOpen} onOpenChange={setIdentityOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("group.identity.title")}</DialogTitle>
              <DialogDescription>{t("group.identity.description")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              {activeMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => pickActor(m.id)}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  <MemberDot member={m} size="sm" />
                  {m.name}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </GroupProvider>
  );
}
