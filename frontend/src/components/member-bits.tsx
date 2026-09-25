import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { formatMinor } from "@/lib/money";
import i18n from "@/lib/i18n";
import type { Group, Member } from "@/lib/types";

export function memberName(group: Group | undefined, id: string) {
  return group?.members.find((m) => m.id === id)?.name ?? i18n.t("common.unknown");
}

export function memberOf(group: Group | undefined, id: string | null | undefined) {
  if (!id) return undefined;
  return group?.members.find((m) => m.id === id);
}

export function MemberDot({
  member,
  size = "md",
  className,
}: {
  member?: Member | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
}) {
  const sizes = {
    sm: "size-6 text-[10px]",
    md: "size-8 text-xs",
    lg: "size-11 text-sm",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase text-background",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: `var(--${member?.color ?? "muted-foreground"})` }}
      aria-hidden
    >
      {member?.name?.slice(0, 2) ?? "?"}
    </span>
  );
}

export function Money({
  amountMinor,
  group,
  signed,
  abs,
  className,
  tone,
}: {
  amountMinor: number;
  group: Pick<Group, "currency_code" | "currency_exponent">;
  signed?: boolean | undefined;
  abs?: boolean | undefined;
  className?: string | undefined;
  tone?: "auto" | "plain" | undefined;
}) {
  const { i18n: i18nInstance } = useTranslation();
  const toneClass =
    tone === "plain"
      ? ""
      : amountMinor > 0
        ? "text-positive"
        : amountMinor < 0
          ? "text-negative"
          : "text-muted-foreground";
  return (
    <span className={cn("money", tone === "plain" ? "" : toneClass, className)}>
      {formatMinor(amountMinor, group.currency_code, group.currency_exponent, {
        signed,
        abs,
        locale: i18nInstance.language,
      })}
    </span>
  );
}
