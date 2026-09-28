import { User } from "@prisma/client";
import { prisma } from "../db/prisma";

export async function listNotifications(user: User, limit = 30) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return {
    unreadCount,
    items: items.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/** Marks the given notifications (or all of the user's, when `ids` is omitted) as read. Only ever touches the user's own. */
export async function markNotificationsRead(user: User, ids?: string[]): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
