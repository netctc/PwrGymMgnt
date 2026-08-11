/**
 * Evolution Notifications — Processes outbox events into user notifications.
 *
 * Converts outbox events (session_consumed, cycle_closed, access_denied, etc.)
 * into notification records visible to members/admins.
 */

import crypto from "crypto";
import type { Pool } from "mysql2/promise";
import { appLogger } from "./observability";

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

type NotificationPayload = {
  userId?: string;
  role?: string;
  title: string;
  body: string;
  type: string;
  linkUrl?: string;
};

async function createNotification(pool: Pool, notification: NotificationPayload): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (id, user_id, role, title, body, type, channel, link_url)
     VALUES (?, ?, ?, ?, ?, ?, 'in_app', ?)`,
    [createId("notif"), notification.userId || null, notification.role || null, notification.title, notification.body, notification.type, notification.linkUrl || null],
  );
}

/**
 * Process an outbox event and generate appropriate notifications.
 * Called from workers.ts drainOutbox().
 */
export async function processOutboxNotification(pool: Pool, eventType: string, payload: any): Promise<boolean> {
  try {
    switch (eventType) {
      case "session_consumed": {
        // Notify member when sessions are running low (≤3 remaining)
        if (payload.balanceAfter !== undefined && payload.balanceAfter <= 3 && payload.balanceAfter >= 0) {
          const memberId = payload.memberId || payload.personId;
          if (memberId) {
            await createNotification(pool, {
              userId: memberId,
              title: "Sessions Running Low",
              body: `You have ${payload.balanceAfter} session(s) remaining in your current cycle.`,
              type: "warning",
              linkUrl: "/subscriptions?tab=affiliations",
            });
          }
        }
        return true;
      }

      case "cycle_closed": {
        await createNotification(pool, {
          role: "admin",
          title: "Cycle Closed",
          body: `Subscription cycle closed for subscription ${payload.subscriptionId?.slice(0, 12)}...`,
          type: "info",
          linkUrl: "/evolution",
        });
        return true;
      }

      case "cycle_opened": {
        // Notify the subscription holder
        if (payload.subscriptionId) {
          const [rows]: any = await pool.query(
            "SELECT holder_member_id FROM subscriptions WHERE id = ? LIMIT 1",
            [payload.subscriptionId],
          );
          if (rows.length > 0) {
            await createNotification(pool, {
              userId: rows[0].holder_member_id,
              title: "New Session Cycle Started",
              body: "Your session balance has been renewed for the new cycle.",
              type: "info",
              linkUrl: "/subscriptions?tab=affiliations",
            });
          }
        }
        return true;
      }

      case "subscription_cancelled": {
        if (payload.subscriptionId) {
          const [rows]: any = await pool.query(
            "SELECT holder_member_id FROM subscriptions WHERE id = ? LIMIT 1",
            [payload.subscriptionId],
          );
          if (rows.length > 0) {
            await createNotification(pool, {
              userId: rows[0].holder_member_id,
              title: "Subscription Cancelled",
              body: `Your subscription has been cancelled. Reason: ${payload.reason || 'Not specified'}`,
              type: "warning",
              linkUrl: "/subscriptions",
            });
          }
        }
        return true;
      }

      case "subscription_frozen":
      case "subscription_suspended": {
        if (payload.subscriptionId) {
          const [rows]: any = await pool.query(
            "SELECT holder_member_id FROM subscriptions WHERE id = ? LIMIT 1",
            [payload.subscriptionId],
          );
          if (rows.length > 0) {
            const status = eventType === "subscription_frozen" ? "frozen" : "suspended";
            await createNotification(pool, {
              userId: rows[0].holder_member_id,
              title: `Subscription ${status.charAt(0).toUpperCase() + status.slice(1)}`,
              body: `Your subscription has been ${status}. ${payload.reason || ''}`.trim(),
              type: "warning",
              linkUrl: "/subscriptions",
            });
          }
        }
        return true;
      }

      case "subscription_resumed": {
        if (payload.subscriptionId) {
          const [rows]: any = await pool.query(
            "SELECT holder_member_id FROM subscriptions WHERE id = ? LIMIT 1",
            [payload.subscriptionId],
          );
          if (rows.length > 0) {
            await createNotification(pool, {
              userId: rows[0].holder_member_id,
              title: "Subscription Resumed",
              body: `Your subscription is active again. New validity end: ${payload.recalculatedEndDate || 'unchanged'}.`,
              type: "info",
              linkUrl: "/subscriptions",
            });
          }
        }
        return true;
      }

      case "access_denied": {
        // Notify admin of repeated denials
        await createNotification(pool, {
          role: "admin",
          title: "Access Denied",
          body: `Access denied for ${payload.personId || 'unknown'}: ${payload.reason || 'Unknown reason'}`,
          type: "error",
          linkUrl: "/access-control?tab=history",
        });
        return true;
      }

      case "plan_changed": {
        if (payload.subscriptionId) {
          const [rows]: any = await pool.query(
            "SELECT holder_member_id FROM subscriptions WHERE id = ? LIMIT 1",
            [payload.subscriptionId],
          );
          if (rows.length > 0) {
            await createNotification(pool, {
              userId: rows[0].holder_member_id,
              title: "Plan Changed",
              body: "Your subscription plan has been updated.",
              type: "info",
              linkUrl: "/subscriptions",
            });
          }
        }
        return true;
      }

      default:
        return false; // Unknown event, not processed
    }
  } catch (error: any) {
    appLogger.error("Notification processing failed", { eventType, error: error.message });
    return false;
  }
}
