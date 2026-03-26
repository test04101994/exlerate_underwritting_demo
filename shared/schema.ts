import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  password: text("password").notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: varchar("role", { length: 50 }).default("user"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const workflowSessions = pgTable("workflow_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  title: text("title").notNull(),
  workflowType: text("workflow_type").notNull().default("submission"), // submission | slip
  caseType: text("case_type").notNull().default("submission"), // submission | slip
  status: text("status").notNull().default("running"), // running, paused, completed, failed
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull().default(6),
  caseId: text("case_id").default("UW-2025-001"), // Case ID (UW-2025-001, SLP-2025-001, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  config: jsonb("config").default({}),
  extractedData: jsonb("extracted_data").default({}), // Store approved extraction data
});

export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().unique(), // SUB-2025-001 or SLP-2025-001
  caseType: text("case_type").notNull(), // submission | slip
  businessName: text("business_name").notNull(),
  policyType: text("policy_type").notNull(),
  assignedUnderwriter: text("assigned_underwriter"),
  priority: text("priority").notNull().default("medium"), // high | medium | low
  status: text("status").notNull().default("pending"), // pending | processing | completed | rejected
  submissionDate: timestamp("submission_date").defaultNow(),
  premium: text("premium"),
  broker: text("broker"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // researcher, analyst, writer, assessor, advisor, custom
  status: text("status").notNull().default("pending"), // pending, running, completed, failed
  progress: integer("progress").notNull().default(0),
  description: text("description"),
  results: jsonb("results").default({}),
  // New fields for custom configuration
  systemPrompt: text("system_prompt"),
  instructions: text("instructions"),
  config: jsonb("config").default({}),
  capabilities: text("capabilities").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(), // system, agent, user, approval
  sender: text("sender").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").default({}),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const approvalRequests = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(), // sanctions_review, email_draft_review
  title: text("title").notNull(),
  description: text("description").notNull(),
  data: jsonb("data").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertWorkflowSessionSchema = createInsertSchema(workflowSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Extended agent configuration schema
export const agentConfigurationSchema = z.object({
  name: z.string().min(1, 'Agent name is required'),
  type: z.string().min(1, 'Agent type is required'),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  instructions: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  config: z.record(z.any()).default({})
});

export type AgentConfiguration = z.infer<typeof agentConfigurationSchema>;

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  firstName: true,
  lastName: true,
  role: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type User = typeof users.$inferSelect;
export type WorkflowSession = typeof workflowSessions.$inferSelect;
export type InsertWorkflowSession = z.infer<typeof insertWorkflowSessionSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
