/**
 * Local Auth Router – register/login with username + password
 * Uses MySQL when available, falls back to in-memory store automatically.
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as z from "zod";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import {
  memGetUserByEmail,
  memGetUserByOpenId,
  memUpsertUser,
} from "./memDb";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";

import { createHash, randomBytes } from "crypto";

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(s + password).digest("hex");
  return { hash, salt: s };
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const { hash: computed } = hashPassword(password, salt);
  return computed === hash;
}

function makePasswordHash(password: string): string {
  const { hash, salt } = hashPassword(password);
  return `${salt}:${hash}`;
}

export const localAuthRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      if (db) {
        // ── MySQL path ────────────────────────────────────────────────────
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (existing.length > 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
        }

        const openId = `local_${nanoid(20)}`;
        const passwordHash = makePasswordHash(input.password);

        await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email,
          password: passwordHash,
          loginMethod: "local",
          role: "user",
          lastSignedIn: new Date(),
        });

        const inserted = await db
          .select()
          .from(users)
          .where(eq(users.openId, openId))
          .limit(1);

        const user = inserted[0];
        const token = await sdk.createSessionToken(openId, { name: user.name ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      } else {
        // ── In-memory path ────────────────────────────────────────────────
        const existing = memGetUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
        }

        const openId = `local_${nanoid(20)}`;
        const passwordHash = makePasswordHash(input.password);

        const user = memUpsertUser({
          openId,
          name: input.name,
          email: input.email,
          password: passwordHash,
          loginMethod: "local",
          role: "user",
          lastSignedIn: new Date(),
        });

        const token = await sdk.createSessionToken(openId, { name: user.name ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      }
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();

      if (db) {
        // ── MySQL path ────────────────────────────────────────────────────
        const result = await db
          .select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (result.length === 0) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        const user = result[0];
        if (!user.password || !verifyPassword(input.password, user.password)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      } else {
        // ── In-memory path ────────────────────────────────────────────────
        const user = memGetUserByEmail(input.email);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        if (!user.password || !verifyPassword(input.password, user.password)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
        }

        user.lastSignedIn = new Date();

        const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
      }
    }),
});
