import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  password: varchar("password", { length: 255 }), // For local auth
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Behavioral profiles - stores baseline behavioral metrics per user
export const behavioralProfiles = mysqlTable("behavioral_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  // Typing dynamics baseline (mean/std of hold times and flight times)
  typingProfile: json("typing_profile"), // {meanHoldTime, stdHoldTime, meanFlightTime, stdFlightTime}
  // Mouse dynamics baseline (mean/std of speeds and distances)
  mouseProfile: json("mouse_profile"), // {meanSpeed, stdSpeed, meanDistance, stdDistance}
  // ML model serialized state
  modelData: text("model_data"), // Serialized Isolation Forest model
  // Training data count
  trainingDataCount: int("training_data_count").default(0),
  // Profile status
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type BehavioralProfile = typeof behavioralProfiles.$inferSelect;
export type InsertBehavioralProfile = typeof behavioralProfiles.$inferInsert;

// Behavior events - logs all behavioral data points
export const behaviorEvents = mysqlTable("behavior_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'typing' or 'mouse'
  // Only timing metrics, no raw data
  eventData: json("event_data"), // {holdTime, flightTime} or {speed, distance, acceleration}
  // Anomaly detection result
  anomalyScore: float("anomaly_score"),
  // Risk assessment
  riskLevel: varchar("risk_level", { length: 20 }), // LOW, MEDIUM, HIGH, CRITICAL
  riskAction: varchar("risk_action", { length: 20 }), // Allow, Monitor, Re-auth challenge, Block
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BehaviorEvent = typeof behaviorEvents.$inferSelect;
export type InsertBehaviorEvent = typeof behaviorEvents.$inferInsert;

// Sessions - tracks active user sessions
export const sessions = mysqlTable("sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  sessionId: varchar("session_id", { length: 255 }).notNull().unique(),
  // Current risk metrics
  currentRiskScore: float("current_risk_score").default(0),
  riskLevel: varchar("risk_level", { length: 20 }).default("LOW"), // LOW, MEDIUM, HIGH, CRITICAL
  riskAction: varchar("risk_action", { length: 20 }).default("Allow"), // Allow, Monitor, Re-auth challenge, Block
  // Session state
  isActive: boolean("is_active").default(true),
  requiresReauth: boolean("requires_reauth").default(false),
  isBlocked: boolean("is_blocked").default(false),
  // Timestamps
  loginTime: timestamp("login_time").defaultNow().notNull(),
  lastActivityTime: timestamp("last_activity_time").defaultNow().notNull(),
  logoutTime: timestamp("logout_time"),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

// Admin audit logs
export const adminLogs = mysqlTable("admin_logs", {
  id: int("id").autoincrement().primaryKey(),
  adminId: int("admin_id").notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  targetUserId: int("target_user_id"),
  targetSessionId: varchar("target_session_id", { length: 255 }),
  details: json("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = typeof adminLogs.$inferInsert;