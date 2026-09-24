import { queryOptions } from "@tanstack/react-query";

import * as api from "./mock-api";

export const groupQuery = (slug: string) =>
  queryOptions({
    queryKey: ["group", slug],
    queryFn: () => api.getGroup(slug),
    retry: false,
  });

export const expensesQuery = (slug: string, filters: api.ExpenseFilters = {}) =>
  queryOptions({
    queryKey: ["expenses", slug, filters],
    queryFn: () => api.listExpenses(slug, filters),
  });

export const balancesQuery = (slug: string) =>
  queryOptions({
    queryKey: ["balances", slug],
    queryFn: () => api.getBalances(slug),
  });

export const settlementsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["settlements", slug],
    queryFn: () => api.listSettlements(slug),
  });

export const breakdownQuery = (slug: string, memberId: string) =>
  queryOptions({
    queryKey: ["breakdown", slug, memberId],
    queryFn: () => api.getMemberBreakdown(slug, memberId),
  });

/** Every write touches balances, so invalidate the whole group namespace. */
export const groupKeys = (slug: string) => [
  ["group", slug],
  ["expenses", slug],
  ["balances", slug],
  ["settlements", slug],
  ["breakdown", slug],
];
