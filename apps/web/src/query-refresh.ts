export function queryRefreshInterval(path: string): number | false {
  const route = path.split("?")[0];
  if (route === "config") return 30000;
  return /^(finance|orders|account|tickets|notifications|subscriptions|business|companies|admin\/(payments|subscriptions|overview|companies|refunds|users|coverage))(\/|$)/.test(
    route,
  )
    ? 15000
    : false;
}
