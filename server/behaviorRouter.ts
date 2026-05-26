/**
 * Behavior tRPC Router
 * Uses MySQL when available, falls back to in-memory store automatically.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod";
import {
  adminLogs,
  behaviorEvents,
  behavioralProfiles,
  sessions,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  memGetBehavioralProfile,
  memUpsertBehavioralProfile,
  memInsertBehaviorEvent,
  memGetBehaviorEventsByUser,
  memGetAllBehaviorEvents,
  memGetOrCreateSession,
  memGetSession,
  memUpdateSession,
  memGetActiveSessions,
  memInsertAdminLog,
} from "./memDb";
import {
  analyzeAnomaly,
  mergeMouseProfile,
  mergeTypingProfile,
  type BehavioralFeatures,
  type BehavioralProfile,
} from "./behaviorEngine";
import { protectedProcedure, router, adminProcedure } from "./_core/trpc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateSession(userId: number, sessionId: string) {
  const db = await getDb();
  if (!db) return memGetOrCreateSession(userId, sessionId);

  const existing = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.sessionId, sessionId), eq(sessions.isActive, true)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  await db.insert(sessions).values({
    userId,
    sessionId,
    currentRiskScore: 0,
    riskLevel: "LOW",
    riskAction: "Allow",
    isActive: true,
    requiresReauth: false,
    isBlocked: false,
    loginTime: new Date(),
    lastActivityTime: new Date(),
  });

  const created = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1);
  return created[0];
}

async function getBehavioralProfile(userId: number): Promise<BehavioralProfile> {
  const db = await getDb();
  if (!db) {
    const p = memGetBehavioralProfile(userId);
    if (!p) return { typingProfile: null, mouseProfile: null, trainingDataCount: 0 };
    return {
      typingProfile: p.typingProfile as any,
      mouseProfile: p.mouseProfile as any,
      trainingDataCount: p.trainingDataCount ?? 0,
    };
  }

  const profiles = await db
    .select()
    .from(behavioralProfiles)
    .where(and(eq(behavioralProfiles.userId, userId), eq(behavioralProfiles.isActive, true)))
    .limit(1);

  if (profiles.length === 0) {
    return { typingProfile: null, mouseProfile: null, trainingDataCount: 0 };
  }

  const p = profiles[0];
  return {
    typingProfile: p.typingProfile as any,
    mouseProfile: p.mouseProfile as any,
    trainingDataCount: p.trainingDataCount ?? 0,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const behaviorRouter = router({
  // Submit behavioral data batch (called every 10s)
  submitBatch: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        typingEvents: z.array(
          z.object({ holdTime: z.number(), flightTime: z.number() })
        ),
        mouseEvents: z.array(
          z.object({ speed: z.number(), distance: z.number(), acceleration: z.number() })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const userId = ctx.user.id;
      const { sessionId, typingEvents, mouseEvents } = input;

      const session = await getOrCreateSession(userId, sessionId);
      if (session.isBlocked) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Session is blocked" });
      }

      const profile = await getBehavioralProfile(userId);
      const features: BehavioralFeatures = { typingEvents, mouseEvents };
      const anomaly = analyzeAnomaly(features, profile);

      const newTypingProfile = mergeTypingProfile(profile.typingProfile, typingEvents);
      const newMouseProfile = mergeMouseProfile(profile.mouseProfile, mouseEvents);
      const newCount = (profile.trainingDataCount ?? 0) + 1;

      if (db) {
        // ── MySQL path ──────────────────────────────────────────────────
        const profiles = await db
          .select()
          .from(behavioralProfiles)
          .where(and(eq(behavioralProfiles.userId, userId), eq(behavioralProfiles.isActive, true)))
          .limit(1);

        if (profiles.length === 0) {
          await db.insert(behavioralProfiles).values({
            userId,
            typingProfile: newTypingProfile as any,
            mouseProfile: newMouseProfile as any,
            trainingDataCount: newCount,
            isActive: true,
          });
        } else {
          await db
            .update(behavioralProfiles)
            .set({
              typingProfile: newTypingProfile as any,
              mouseProfile: newMouseProfile as any,
              trainingDataCount: newCount,
              updatedAt: new Date(),
            })
            .where(eq(behavioralProfiles.id, profiles[0].id));
        }

        await db.insert(behaviorEvents).values({
          userId,
          sessionId,
          eventType: "batch",
          eventData: {
            typingCount: typingEvents.length,
            mouseCount: mouseEvents.length,
            anomalyDetails: anomaly.details,
          } as any,
          anomalyScore: anomaly.anomalyScore,
          riskLevel: anomaly.riskLevel,
          riskAction: anomaly.riskAction,
        });

        const requiresReauth = anomaly.riskLevel === "HIGH" || anomaly.riskLevel === "CRITICAL";
        const isBlocked = anomaly.riskLevel === "CRITICAL";

        await db
          .update(sessions)
          .set({
            currentRiskScore: anomaly.anomalyScore,
            riskLevel: anomaly.riskLevel,
            riskAction: anomaly.riskAction,
            requiresReauth,
            isBlocked,
            lastActivityTime: new Date(),
          })
          .where(eq(sessions.sessionId, sessionId));
      } else {
        // ── In-memory path ──────────────────────────────────────────────
        memUpsertBehavioralProfile({ userId, typingProfile: newTypingProfile, mouseProfile: newMouseProfile, trainingDataCount: newCount });
        memInsertBehaviorEvent({
          userId,
          sessionId,
          eventType: "batch",
          eventData: { typingCount: typingEvents.length, mouseCount: mouseEvents.length, anomalyDetails: anomaly.details },
          anomalyScore: anomaly.anomalyScore,
          riskLevel: anomaly.riskLevel,
          riskAction: anomaly.riskAction,
        });

        const requiresReauth = anomaly.riskLevel === "HIGH" || anomaly.riskLevel === "CRITICAL";
        const isBlocked = anomaly.riskLevel === "CRITICAL";
        memUpdateSession(sessionId, {
          currentRiskScore: anomaly.anomalyScore,
          riskLevel: anomaly.riskLevel,
          riskAction: anomaly.riskAction,
          requiresReauth,
          isBlocked,
          lastActivityTime: new Date(),
        });
      }

      const requiresReauth = anomaly.riskLevel === "HIGH" || anomaly.riskLevel === "CRITICAL";
      const isBlocked = anomaly.riskLevel === "CRITICAL";

      return {
        anomalyScore: anomaly.anomalyScore,
        riskLevel: anomaly.riskLevel,
        riskAction: anomaly.riskAction,
        requiresReauth,
        isBlocked,
        trainingProgress: Math.min(100, (newCount / 5) * 100),
      };
    }),

  // Get current session risk state
  getSessionRisk: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        const s = memGetSession(input.sessionId);
        return s && s.userId === ctx.user.id ? s : null;
      }

      const result = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, ctx.user.id), eq(sessions.sessionId, input.sessionId)))
        .limit(1);

      return result[0] ?? null;
    }),

  // Get user's risk history
  getRiskHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return memGetBehaviorEventsByUser(ctx.user.id, input.limit);

      return db
        .select()
        .from(behaviorEvents)
        .where(eq(behaviorEvents.userId, ctx.user.id))
        .orderBy(desc(behaviorEvents.createdAt))
        .limit(input.limit);
    }),

  // Re-authenticate and reset risk
  reAuthenticate: protectedProcedure
    .input(z.object({ sessionId: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      if (!input.password || input.password.length < 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid credentials" });
      }

      if (db) {
        await db
          .update(sessions)
          .set({
            currentRiskScore: 0,
            riskLevel: "LOW",
            riskAction: "Allow",
            requiresReauth: false,
            isBlocked: false,
            lastActivityTime: new Date(),
          })
          .where(and(eq(sessions.userId, ctx.user.id), eq(sessions.sessionId, input.sessionId)));
      } else {
        memUpdateSession(input.sessionId, {
          currentRiskScore: 0,
          riskLevel: "LOW",
          riskAction: "Allow",
          requiresReauth: false,
          isBlocked: false,
          lastActivityTime: new Date(),
        });
      }

      return { success: true };
    }),

  // ── Admin routes ─────────────────────────────────────────────────────────────
  admin: router({
    activeSessions: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return memGetActiveSessions();

      return db
        .select()
        .from(sessions)
        .where(eq(sessions.isActive, true))
        .orderBy(desc(sessions.lastActivityTime))
        .limit(100);
    }),

    terminateSession: adminProcedure
      .input(z.object({ sessionId: z.string(), targetUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();

        if (db) {
          await db
            .update(sessions)
            .set({ isActive: false, isBlocked: true, logoutTime: new Date() })
            .where(eq(sessions.sessionId, input.sessionId));

          await db.insert(adminLogs).values({
            adminId: ctx.user.id,
            action: "terminate_session",
            targetUserId: input.targetUserId,
            targetSessionId: input.sessionId,
            details: { reason: "Admin terminated" } as any,
          });
        } else {
          memUpdateSession(input.sessionId, { isActive: false, isBlocked: true, logoutTime: new Date() });
          memInsertAdminLog({
            adminId: ctx.user.id,
            action: "terminate_session",
            targetUserId: input.targetUserId,
            targetSessionId: input.sessionId,
            details: { reason: "Admin terminated" },
          });
        }

        return { success: true };
      }),

    behaviorLogs: adminProcedure
      .input(z.object({ limit: z.number().default(100) }))
      .query(async () => {
        const db = await getDb();
        if (!db) return memGetAllBehaviorEvents(100);

        return db
          .select()
          .from(behaviorEvents)
          .orderBy(desc(behaviorEvents.createdAt))
          .limit(100);
      }),
  }),
});
