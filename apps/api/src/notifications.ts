import type { DB, TX } from "./database.js";
import { pageRequest } from "./pagination.js";

export class NotificationService {
  constructor(public db: DB) {}
  async list(userId: string, query: Record<string, string>) {
    const where = { userId };
    if (query.paged !== "true")
      return this.db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    const page = pageRequest(
      query,
      await this.db.notification.count({ where }),
    );
    const [items, unread] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: page.skip,
        take: page.limit,
      }),
      this.db.notification.count({ where: { ...where, readAt: null } }),
    ]);
    const { skip, ...metadata } = page;
    return { ...metadata, unread, items };
  }
  async admins(
    title: string,
    body: string,
    href: string,
    db: DB | TX = this.db,
  ) {
    const admins = await db.user.findMany({
      where: { role: "admin", deletedAt: null },
      select: { id: true },
    });
    for (const user of admins)
      await this.notify(user.id, title, body, href, db);
  }
  async owners(
    companyId: string,
    title: string,
    body: string,
    href: string,
    db: DB | TX = this.db,
  ) {
    const owners = await db.membership.findMany({
      where: { companyId, role: "owner" },
    });
    for (const owner of owners)
      await this.notify(owner.userId, title, body, href, db);
  }
  async notify(
    userId: string,
    title: string,
    body: string,
    href: string,
    db: DB | TX = this.db,
  ) {
    return db.notification.create({ data: { userId, title, body, href } });
  }
}
