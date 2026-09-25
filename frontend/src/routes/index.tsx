import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus, Receipt, Scale, Split, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as api from "@/lib/mock-api";
import { translateApiError } from "@/lib/api-errors";
import { SUPPORTED_CURRENCIES } from "@/lib/money";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SplitIt — split shared expenses with no sign-up" },
      {
        name: "description",
        content:
          "Create a group, log what everyone paid, and SplitIt turns it into the shortest list of payments that settles up.",
      },
      { property: "og:title", content: "SplitIt — split shared expenses with no sign-up" },
      {
        property: "og:description",
        content: "Log shared expenses, split them any way, and see exactly who owes whom.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("COP");
  const [myName, setMyName] = useState("");
  const [others, setOthers] = useState<string[]>([""]);
  const [pin, setPin] = useState("");
  const [recent, setRecent] = useState<api.RecentGroup[]>([]);

  useEffect(() => {
    setRecent(api.listRecentGroups());
  }, []);

  const create = useMutation({
    mutationFn: () =>
      api.createGroup({
        name,
        currency_code: currency,
        my_name: myName,
        member_names: others.map((o) => o.trim()).filter(Boolean),
        pin: pin || null,
      }),
    onSuccess: (group) => {
      toast.success(t("home.toastCreated"));
      void navigate({ to: "/g/$slug", params: { slug: group.slug } });
    },
    onError: (error) => toast.error(translateApiError(t, error)),
  });

  const canCreate = name.trim().length > 0 && myName.trim().length > 0;

  return (
    <div className="min-h-screen surface-grid">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="font-display text-lg font-semibold">
          Split<span className="text-primary">It</span>
        </span>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-10">
        <section className="flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {t("home.eyebrow")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] sm:text-5xl">
            {t("home.headline")}
          </h1>
          <p className="mt-5 max-w-lg text-base text-muted-foreground">{t("home.subhead")}</p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: Split,
                title: t("home.features.split.title"),
                text: t("home.features.split.text"),
              },
              {
                icon: Receipt,
                title: t("home.features.payers.title"),
                text: t("home.features.payers.text"),
              },
              {
                icon: Scale,
                title: t("home.features.balanced.title"),
                text: t("home.features.balanced.text"),
              },
            ].map((f) => (
              <li key={f.title} className="rounded-xl border bg-card/70 p-4 backdrop-blur">
                <f.icon className="size-4 text-primary" />
                <p className="mt-3 text-sm font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Button asChild variant="secondary">
              <Link to="/g/$slug" params={{ slug: api.DEMO_SLUG }}>
                {t("home.demoLink")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          {recent.length > 0 ? (
            <div className="mt-10">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("home.recentGroupsHeading")}
              </p>
              <div className="mt-3 grid gap-2">
                {recent.map((r) => (
                  <Link
                    key={r.slug}
                    to="/g/$slug"
                    params={{ slug: r.slug }}
                    className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.currency_code}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section>
          <Card className="border-border/70 shadow-[var(--shadow-lift)]">
            <CardContent className="grid gap-5 pt-6">
              <div>
                <h2 className="text-xl font-semibold">{t("home.form.heading")}</h2>
                <p className="text-sm text-muted-foreground">{t("home.form.subheading")}</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="group-name">{t("home.form.groupNameLabel")}</Label>
                <Input
                  id="group-name"
                  value={name}
                  placeholder={t("home.form.groupNamePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{t("home.form.currencyLabel")}</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pin">{t("home.form.pinLabel")}</Label>
                  <Input
                    id="pin"
                    inputMode="numeric"
                    maxLength={8}
                    value={pin}
                    placeholder={t("home.form.pinPlaceholder")}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="my-name">{t("home.form.yourNameLabel")}</Label>
                <Input
                  id="my-name"
                  value={myName}
                  maxLength={40}
                  placeholder={t("home.form.yourNamePlaceholder")}
                  onChange={(e) => setMyName(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label>{t("home.form.othersLabel")}</Label>
                {others.map((value, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={value}
                      maxLength={40}
                      placeholder={t("home.form.personPlaceholder", { n: i + 1 })}
                      onChange={(e) =>
                        setOthers((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                      }
                    />
                    {others.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("home.form.removePerson")}
                        onClick={() => setOthers((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <X className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-self-start"
                  onClick={() => setOthers((prev) => [...prev, ""])}
                >
                  <Plus className="size-4" />
                  {t("home.form.addAnother")}
                </Button>
              </div>

              <Button
                size="lg"
                disabled={!canCreate || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? t("common.creating") : t("home.form.submit")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("home.form.hint")}</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
