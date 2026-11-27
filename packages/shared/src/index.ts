export const ORDER_STATES = [
  "requested",
  "accepted",
  "collection_scheduled",
  "collected",
  "processing",
  "ready",
  "out_for_delivery",
  "delivered",
  "completed",
  "cancelled",
] as const;
export type OrderState = (typeof ORDER_STATES)[number];
export const transitions: Record<string, string[]> = {
  requested: ["accepted", "cancelled"],
  accepted: ["collection_scheduled", "collected", "cancelled"],
  collection_scheduled: ["collected", "cancelled"],
  collected: ["processing"],
  processing: ["ready"],
  ready: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(n / 100);
export const dateLabel = (
  s: string | Date,
  options?: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    day: "numeric",
    month: "short",
    ...options,
  }).format(new Date(s));
export const titleCase = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const DEMO_PASSWORD = "FreshFold.Demo!2026";
export const paymentScenarios = [
  "success",
  "declined",
  "insufficient_funds",
  "cancelled",
  "pending",
  "delayed",
  "duplicate",
  "late_success",
] as const;
export type PaymentScenario = (typeof paymentScenarios)[number];
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: string;
  premium: boolean;
  companyId?: string;
  permissions: string[];
  csrf?: string;
  canResetTestAccount?: boolean;
}
