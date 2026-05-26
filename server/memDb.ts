/**
 * In-memory database fallback.
 * Mirrors all tables from drizzle/schema.ts using plain JS Maps/arrays.
 * Used automatically when DATABASE_URL is not set or MySQL is unreachable.
 */

import { createHash, randomBytes } from "crypto";

// ── Types (mirror schema) ────────────────────────────────────────────────────

export interface MemUser {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  password: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
}

export interface MemBehavioralProfile {
  id: number;
  userId: number;
  typingProfile: unknown;
  mouseProfile: unknown;
  modelData: string | null;
  trainingDataCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemBehaviorEvent {
  id: number;
  userId: number;
  sessionId: string;
  eventType: string;
  eventData: unknown;
  anomalyScore: number | null;
  riskLevel: string | null;
  riskAction: string | null;
  createdAt: Date;
}

export interface MemSession {
  id: number;
  userId: number;
  sessionId: string;
  currentRiskScore: number;
  riskLevel: string;
  riskAction: string;
  isActive: boolean;
  requiresReauth: boolean;
  isBlocked: boolean;
  loginTime: Date;
  lastActivityTime: Date;
  logoutTime: Date | null;
}

export interface MemAdminLog {
  id: number;
  adminId: number;
  action: string;
  targetUserId: number | null;
  targetSessionId: string | null;
  details: unknown;
  createdAt: Date;
}

// ── Stores ───────────────────────────────────────────────────────────────────

const store = {
  users: new Map<number, MemUser>(),
  usersByOpenId: new Map<string, number>(),
  usersByEmail: new Map<string, number>(),
  behavioralProfiles: new Map<number, MemBehavioralProfile>(),
  behaviorEvents: [] as MemBehaviorEvent[],
  sessions: new Map<string, MemSession>(),
  adminLogs: [] as MemAdminLog[],
  _nextId: { users: 1, profiles: 1, events: 1, sessions: 1, logs: 1 },
};

// ── Users ────────────────────────────────────────────────────────────────────

export function memGetUserByOpenId(openId: string): MemUser | undefined {
  const id = store.usersByOpenId.get(openId);
  return id !== undefined ? store.users.get(id) : undefined;
}

export function memGetUserByEmail(email: string): MemUser | undefined {
  const id = store.usersByEmail.get(email.toLowerCase());
  return id !== undefined ? store.users.get(id) : undefined;
}

export function memUpsertUser(data: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  password?: string | null;
  role?: "user" | "admin";
  lastSignedIn?: Date;
}): MemUser {
  const existing = memGetUserByOpenId(data.openId);
  const now = new Date();

  if (existing) {
    if (data.name !== undefined) existing.name = data.name ?? null;
    if (data.email !== undefined) existing.email = data.email ?? null;
    if (data.loginMethod !== undefined) existing.loginMethod = data.loginMethod ?? null;
    if (data.password !== undefined) existing.password = data.password ?? null;
    if (data.role !== undefined) existing.role = data.role;
    existing.lastSignedIn = data.lastSignedIn ?? now;
    existing.updatedAt = now;
    if (existing.email) store.usersByEmail.set(existing.email.toLowerCase(), existing.id);
    return existing;
  }

  const id = store._nextId.users++;
  const user: MemUser = {
    id,
    openId: data.openId,
    name: data.name ?? null,
    email: data.email ?? null,
    loginMethod: data.loginMethod ?? null,
    password: data.password ?? null,
    role: data.role ?? "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: data.lastSignedIn ?? now,
  };
  store.users.set(id, user);
  store.usersByOpenId.set(data.openId, id);
  if (user.email) store.usersByEmail.set(user.email.toLowerCase(), id);
  return user;
}

// ── Behavioral Profiles ───────────────────────────────────────────────────────

export function memGetBehavioralProfile(userId: number): MemBehavioralProfile | undefined {
  for (const p of store.behavioralProfiles.values()) {
    if (p.userId === userId && p.isActive) return p;
  }
  return undefined;
}

export function memUpsertBehavioralProfile(data: {
  userId: number;
  typingProfile: unknown;
  mouseProfile: unknown;
  trainingDataCount: number;
}): void {
  const existing = memGetBehavioralProfile(data.userId);
  const now = new Date();
  if (existing) {
    existing.typingProfile = data.typingProfile;
    existing.mouseProfile = data.mouseProfile;
    existing.trainingDataCount = data.trainingDataCount;
    existing.updatedAt = now;
  } else {
    const id = store._nextId.profiles++;
    store.behavioralProfiles.set(id, {
      id,
      userId: data.userId,
      typingProfile: data.typingProfile,
      mouseProfile: data.mouseProfile,
      modelData: null,
      trainingDataCount: data.trainingDataCount,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// ── Behavior Events ───────────────────────────────────────────────────────────

export function memInsertBehaviorEvent(data: {
  userId: number;
  sessionId: string;
  eventType: string;
  eventData: unknown;
  anomalyScore: number | null;
  riskLevel: string | null;
  riskAction: string | null;
}): void {
  const id = store._nextId.events++;
  store.behaviorEvents.push({ ...data, id, createdAt: new Date() });
}

export function memGetBehaviorEventsByUser(userId: number, limit = 50): MemBehaviorEvent[] {
  return store.behaviorEvents
    .filter(e => e.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export function memGetAllBehaviorEvents(limit = 100): MemBehaviorEvent[] {
  return [...store.behaviorEvents]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export function memGetSession(sessionId: string): MemSession | undefined {
  return store.sessions.get(sessionId);
}

export function memGetOrCreateSession(userId: number, sessionId: string): MemSession {
  const existing = store.sessions.get(sessionId);
  if (existing && existing.isActive) return existing;

  const id = store._nextId.sessions++;
  const session: MemSession = {
    id,
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
    logoutTime: null,
  };
  store.sessions.set(sessionId, session);
  return session;
}

export function memUpdateSession(sessionId: string, updates: Partial<MemSession>): void {
  const s = store.sessions.get(sessionId);
  if (s) Object.assign(s, updates);
}

export function memGetActiveSessions(): MemSession[] {
  return [...store.sessions.values()]
    .filter(s => s.isActive)
    .sort((a, b) => b.lastActivityTime.getTime() - a.lastActivityTime.getTime())
    .slice(0, 100);
}

// ── Admin Logs ────────────────────────────────────────────────────────────────

export function memInsertAdminLog(data: {
  adminId: number;
  action: string;
  targetUserId?: number | null;
  targetSessionId?: string | null;
  details?: unknown;
}): void {
  const id = store._nextId.logs++;
  store.adminLogs.push({
    id,
    adminId: data.adminId,
    action: data.action,
    targetUserId: data.targetUserId ?? null,
    targetSessionId: data.targetSessionId ?? null,
    details: data.details ?? null,
    createdAt: new Date(),
  });
}
