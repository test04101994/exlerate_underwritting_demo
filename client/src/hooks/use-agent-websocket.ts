import { useState, useRef, useCallback, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlanStep {
  text: string;
  status: "pending" | "executing" | "completed" | "failed";
}

export interface PlanData {
  planId: string;
  goal: string;
  steps: PlanStep[];
  status: "awaiting_approval" | "executing" | "completed" | "rejected";
  source?: "user" | "webhook";
  ticketKey?: string;
}

export interface EmailDraftData {
  draftId: string;
  body: string;
  revisionCount: number;
  status: "reviewing" | "approved" | "sent";
  /** Short preview line (from agent context), not an email subject */
  label?: string;
  ticketKey?: string;
  /** Legacy fields from older server payloads */
  to?: string;
  subject?: string;
}

export interface ExtractionResultData {
  extractionId: string;
  ticketKey: string;
  fieldCount: number;
  status: string;
  s3Uri: string;
}

export interface AgentMessage {
  id: string;
  type: "user" | "agent" | "tool_call" | "tool_result" | "error" | "system" | "plan" | "file_upload" | "email_draft" | "data_extraction";
  content: string;
  tool?: string;
  toolInput?: Record<string, any>;
  toolResult?: string;
  toolUseId?: string;
  plan?: PlanData;
  emailDraft?: EmailDraftData;
  extraction?: ExtractionResultData;
  timestamp: Date;
}

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  capabilities: string[];
  tools: string[];
  examples: string[];
}

export interface ActivityEvent {
  id: string;
  type: "user_message" | "tool_call" | "agent_response" | "system" | "error";
  label: string;
  detail?: string;
  timestamp: Date;
}

export interface SessionRecord {
  session_id: string;
  ticket_key: string;
  created_at: string;
  last_active: string;
  message_count: number;
  summary: string;
}

interface UseAgentWebSocketReturn {
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
  fetchAgents: () => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  approvePlan: (planId: string) => void;
  rejectPlan: (planId: string) => void;
  approveEmail: (draftId: string) => void;
  reviseEmail: (draftId: string, feedback: string) => void;
  newSession: () => void;
  fetchSessions: (ticketKey: string) => Promise<SessionRecord[]>;
  loadSessionMessages: (ticketKey: string, sessionId: string) => Promise<void>;
  isConnected: boolean;
  isConnecting: boolean;
  isThinking: boolean;
  isUploading: boolean;
  messages: AgentMessage[];
  agents: AgentInfo[];
  agentsLoading: boolean;
  activityLog: ActivityEvent[];
  toolCallCount: number;
  sessionId: string;
  activeAgentId: string | null;
  sessionList: SessionRecord[];
}

// ── WS URL ───────────────────────────────────────────────────────────────────

function getWsUrl(token: string, workflowType?: string): string {
  const envUrl = import.meta.env.VITE_AGENT_WS_URL;
  if (envUrl) return `${envUrl}?token=${token}`;

  if (import.meta.env.DEV) {
    // In dev, always use port 8080 — workflow switching handled via set_workflow_type message
    return `ws://localhost:8080/ws?token=${token}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws?token=${token}`;
}

function getAgentCoreUrl(workflowType?: string): string {
  if (import.meta.env.DEV) {
    // In dev, always use port 8080 — workflow switching handled via set_workflow_type message
    return "http://localhost:8080";
  }
  // In production, /agents is routed to AgentCore via ALB/CloudFront
  return "";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

function storageKey(ticketKey?: string): string {
  return ticketKey ? `agentcore-chat-${ticketKey}` : "agentcore-chat-messages";
}

function loadMessages(ticketKey?: string): AgentMessage[] {
  try {
    const raw = sessionStorage.getItem(storageKey(ticketKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function saveMessages(msgs: AgentMessage[], ticketKey?: string) {
  try {
    sessionStorage.setItem(storageKey(ticketKey), JSON.stringify(msgs));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function useAgentWebSocket(ticketKey?: string, workflowType?: string): UseAgentWebSocketReturn {
  const [messages, setMessages] = useState<AgentMessage[]>(() => loadMessages(ticketKey));
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [toolCallCount, setToolCallCount] = useState(0);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([]);
  const [sessionId, _setSessionId] = useState(() => crypto.randomUUID().slice(0, 8));
  const sessionIdRef = useRef(sessionId);
  const setSessionId = useCallback((id: string) => {
    sessionIdRef.current = id;
    _setSessionId(id);
  }, []);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [sessionList, setSessionList] = useState<SessionRecord[]>([]);
  const pendingReconnectRef = useRef(false);
  const isReconnectRef = useRef(false);

  // Persist messages to sessionStorage (namespaced by ticket)
  useEffect(() => {
    saveMessages(messages, ticketKey);
  }, [messages, ticketKey]);

  // Auto-reconnect after newSession generates a fresh ID
  useEffect(() => {
    if (pendingReconnectRef.current && sessionId) {
      pendingReconnectRef.current = false;
      // Small delay to ensure state is flushed
      const t = setTimeout(() => connect(), 100);
      return () => clearTimeout(t);
    }
  }, [sessionId]);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamBufferRef = useRef<string>("");
  const streamMsgIdRef = useRef<string>("");

  // ── Activity Log ─────────────────────────────────────────────────────────

  const addActivity = useCallback(
    (type: ActivityEvent["type"], label: string, detail?: string) => {
      setActivityLog((prev) => [
        ...prev,
        { id: crypto.randomUUID(), type, label, detail, timestamp: new Date() },
      ]);
    },
    []
  );

  // ── Message Helpers ──────────────────────────────────────────────────────

  const addMessage = useCallback(
    (msg: Omit<AgentMessage, "id" | "timestamp">) => {
      const newMsg: AgentMessage = {
        ...msg,
        id: crypto.randomUUID(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, newMsg]);
      return newMsg.id;
    },
    []
  );

  const updateMessage = useCallback(
    (id: string, updates: Partial<AgentMessage>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
      );
    },
    []
  );

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setIsThinking(false);
    streamBufferRef.current = "";
    streamMsgIdRef.current = "";
  }, []);

  // ── Agent Discovery ──────────────────────────────────────────────────────

  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const baseUrl = getAgentCoreUrl(workflowType);
      const wfParam = workflowType ? `?workflow_type=${workflowType}` : "";
      const resp = await fetch(`${baseUrl}/agents${wfParam}`);
      if (resp.ok) {
        const data = await resp.json();
        setAgents(data);
      }
    } catch (e) {
      console.warn("Failed to fetch agents:", e);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // ── Session History ─────────────────────────────────────────────────────

  const fetchSessions = useCallback(async (tk: string): Promise<SessionRecord[]> => {
    try {
      const resp = await fetch(`/api/sessions/${tk}`, { credentials: "include" });
      if (!resp.ok) return [];
      const data: SessionRecord[] = await resp.json();
      setSessionList(data);
      return data;
    } catch {
      return [];
    }
  }, []);

  const loadSessionMessages = useCallback(async (tk: string, sid: string): Promise<void> => {
    try {
      const resp = await fetch(`/api/sessions/${tk}/${sid}/messages`, { credentials: "include" });
      if (!resp.ok) return;
      const msgs: any[] = await resp.json();
      const converted: AgentMessage[] = msgs.map((m: any, i: number) => {
        // Reconstruct email_draft messages with full draft data
        if (m.type === "email_draft" && m.draftId) {
          return {
            id: `hist-${sid}-${i}`,
            type: "email_draft" as const,
            content: m.to ? `Email draft: ${m.subject || m.label || ""}` : `Jira comment draft: ${m.label || ""}`,
            emailDraft: {
              draftId: m.draftId,
              body: m.body || "",
              revisionCount: m.revisionCount || 0,
              status: m.status || "sent",
              label: m.label || "",
              ticketKey: m.ticketKey || "",
              to: m.to || "",
              subject: m.subject || "",
            } as any,
            timestamp: new Date(m.timestamp || Date.now()),
          };
        }
        // Reconstruct tool_call messages
        if (m.type === "tool_call" && m.tool) {
          return {
            id: `hist-${sid}-${i}`,
            type: "tool_call" as const,
            content: `${m.tool}(${JSON.stringify(m.input || {})})`,
            metadata: { tool: m.tool, input: m.input },
            timestamp: new Date(m.timestamp || Date.now()),
          };
        }
        return {
          id: `hist-${sid}-${i}`,
          type: m.type === "user" ? "user" : "agent",
          content: m.content || "",
          timestamp: new Date(m.timestamp || Date.now()),
        };
      });
      setMessages(converted);
    } catch {}
  }, []);

  // ── WebSocket Connection ─────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    cleanup();
    setIsConnecting(!isReconnectRef.current); // Don't show "Connecting..." on silent reconnect

    try {
      const resp = await apiRequest("POST", "/api/auth/ws-token");
      const { token } = await resp.json();
      const url = getWsUrl(token, workflowType);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        addActivity("system", "Connected to AgentCore");

        // Send ticket context immediately for session isolation
        if (ticketKey) {
          ws.send(JSON.stringify({ type: "set_ticket_context", ticketKey }));
          ws.send(JSON.stringify({ type: "register_session", sessionId: sessionIdRef.current }));
        }

        // Send workflow type for submissions vs jira agent selection
        if (workflowType) {
          const subId = new URLSearchParams(window.location.search).get("submission") || "";
          ws.send(JSON.stringify({ type: "set_workflow_type", workflowType, submissionId: subId }));
        }

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15_000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "system": {
              const sysContent = (msg.content || "").toLowerCase();
              const isReady = sysContent.includes("ready") || sysContent.includes("ingested");
              if (isReady) {
                // Remove the "processing" spinner message
                setMessages((prev) =>
                  prev.filter(
                    (m) =>
                      !(
                        m.type === "system" &&
                        (m.content?.toLowerCase().includes("processing") ||
                          m.content?.toLowerCase().includes("extracting"))
                      )
                  )
                );
              }
              // Suppress noisy system messages (connection, session, document status)
              const skip = sysContent.includes("connected") ||
                sysContent.includes("session linked") ||
                sysContent.includes("document ready") ||
                sysContent.includes("ready for analysis") ||
                sysContent.includes("orchestrator ready");
              if (skip) break;
              addMessage({ type: "system", content: msg.content });
              break;
            }

            case "agent_response": {
              setIsThinking(false);
              streamBufferRef.current += msg.content;
              // Strip XML tags in real-time so they never flash on screen
              const cleanContent = streamBufferRef.current
                .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
                .replace(/<\/?(?:thinking|toolResult|toolUse|tool|result|response|function_calls|invoke|parameter|antml:)[^>]*>/gi, "")
                .trim();
              if (!streamMsgIdRef.current) {
                const id = crypto.randomUUID();
                streamMsgIdRef.current = id;
                setMessages((prev) => [
                  ...prev,
                  { id, type: "agent", content: cleanContent, timestamp: new Date() },
                ]);
              } else {
                updateMessage(streamMsgIdRef.current, { content: cleanContent });
              }
              break;
            }

            case "tool_call": {
              setToolCallCount((c) => c + 1);
              // Highlight the agent that owns this tool
              const ownerAgent = agents.find((a) => a.tools.includes(msg.tool));
              if (ownerAgent) setActiveAgentId(ownerAgent.id);
              addMessage({
                type: "tool_call",
                content: `Calling ${msg.tool}(${JSON.stringify(msg.input)})`,
                tool: msg.tool,
                toolInput: msg.input,
                toolUseId: msg.toolUseId,
              });
              addActivity("tool_call", `Tool: ${msg.tool}`, JSON.stringify(msg.input));
              break;
            }

            case "tool_result":
              addMessage({
                type: "tool_result",
                content: msg.result,
                tool: msg.tool,
                toolResult: msg.result,
                toolUseId: msg.toolUseId,
              });
              break;

            case "agent_done":
              setIsThinking(false);
              // Keep active agent highlighted briefly so user sees it
              setTimeout(() => setActiveAgentId(null), 1500);
              if (streamMsgIdRef.current) {
                updateMessage(streamMsgIdRef.current, { content: msg.content });
              } else {
                addMessage({ type: "agent", content: msg.content });
              }
              streamBufferRef.current = "";
              streamMsgIdRef.current = "";
              addActivity("agent_response", "Agent responded");
              break;

            case "plan_proposal": {
              setIsThinking(false);
              streamBufferRef.current = "";
              streamMsgIdRef.current = "";
              const isWebhook = msg.source === "webhook";
              const planData: PlanData = {
                planId: msg.planId,
                goal: msg.goal,
                steps: (msg.steps || []).map((s: string) => ({ text: s, status: "pending" as const })),
                status: "awaiting_approval",
                source: isWebhook ? "webhook" : "user",
                ticketKey: msg.ticketKey || "",
              };
              addMessage({
                type: "plan",
                content: msg.goal,
                plan: planData,
              });
              const label = isWebhook
                ? `Webhook plan (${msg.ticketKey || "Jira"})`
                : "Plan proposed";
              addActivity("system", label, msg.goal);
              break;
            }

            case "plan_status": {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.type === "plan" && m.plan?.planId === msg.planId) {
                    return {
                      ...m,
                      plan: { ...m.plan!, status: msg.status },
                    };
                  }
                  return m;
                })
              );
              if (msg.status === "executing") {
                setIsThinking(true);
                addActivity("system", "Plan executing");
              } else if (msg.status === "completed") {
                setIsThinking(false);
                addActivity("system", "Plan completed");
              } else if (msg.status === "rejected") {
                setIsThinking(false);
                addActivity("system", "Plan rejected");
              }
              break;
            }

            case "plan_step_update": {
              // Update individual step status within a plan
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.type === "plan" && m.plan?.planId === msg.planId) {
                    const updatedSteps = [...m.plan!.steps];
                    if (msg.stepIndex >= 0 && msg.stepIndex < updatedSteps.length) {
                      updatedSteps[msg.stepIndex] = {
                        ...updatedSteps[msg.stepIndex],
                        status: msg.status,
                      };
                    }
                    return {
                      ...m,
                      plan: { ...m.plan!, steps: updatedSteps },
                    };
                  }
                  return m;
                })
              );
              if (msg.status === "executing") {
                // Highlight planner agent
                const plannerAgent = agents.find((a) => a.id === "planner");
                if (plannerAgent) setActiveAgentId(plannerAgent.id);
                addActivity("system", `Executing step ${msg.stepIndex + 1}`);
              } else if (msg.status === "completed") {
                addActivity("system", `Step ${msg.stepIndex + 1} completed`);
              } else if (msg.status === "failed") {
                addActivity("error", `Step ${msg.stepIndex + 1} failed`);
              }
              break;
            }

            case "email_draft": {
              setIsThinking(false);
              const draftData: EmailDraftData = {
                draftId: msg.draftId,
                body: msg.body,
                revisionCount: msg.revisionCount || 0,
                status: "reviewing",
                label: msg.label,
                ticketKey: msg.ticketKey,
                to: msg.to,
                subject: msg.subject,
              };
              // Check if this is an update to an existing draft (revision) — update in-place
              setMessages((prev) => {
                const existingIdx = prev.findIndex(
                  (m) => m.type === "email_draft" && m.emailDraft?.draftId === msg.draftId
                );
                if (existingIdx >= 0) {
                  const updated = [...prev];
                  updated[existingIdx] = { ...updated[existingIdx], emailDraft: draftData };
                  return updated;
                }
                // New draft — add as new message
                const isEmail = !!(msg.to || msg.subject);
                return [...prev, {
                  id: crypto.randomUUID?.() || Date.now().toString(),
                  type: "email_draft" as const,
                  content: isEmail
                    ? `Email draft: ${msg.subject || msg.label || "ready for review"}`
                    : msg.label
                      ? `Jira comment draft: ${msg.label}`
                      : "Jira comment draft ready for review",
                  emailDraft: draftData,
                  timestamp: new Date(),
                }];
              });
              const reconciliationAgent = agents.find((a) => a.id === "reconciliation");
              if (reconciliationAgent) setActiveAgentId(reconciliationAgent.id);
              addActivity("system", "Jira comment draft ready", msg.label || msg.ticketKey || "");
              break;
            }

            case "email_sent": {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.type === "email_draft" && m.emailDraft?.draftId === msg.draftId) {
                    return {
                      ...m,
                      emailDraft: { ...m.emailDraft!, status: "sent" as const },
                    };
                  }
                  return m;
                })
              );
              addActivity("system", "Reconciliation summary posted to Jira");
              break;
            }

            case "data_extraction": {
              setIsThinking(false);
              const extractionData: ExtractionResultData = {
                extractionId: msg.extractionId,
                ticketKey: msg.ticketKey || "",
                fieldCount: msg.fieldCount || 0,
                status: msg.status || "pending_review",
                s3Uri: msg.s3Uri || "",
              };
              addMessage({
                type: "data_extraction",
                content: `Data extracted (${msg.fieldCount} fields). Click to validate.`,
                extraction: extractionData,
              });
              const extractionAgent = agents.find((a) => a.id === "data_extraction");
              if (extractionAgent) setActiveAgentId(extractionAgent.id);
              addActivity("system", "Data extraction complete", `${msg.fieldCount} fields`);
              break;
            }

            case "error":
              setIsThinking(false);
              addMessage({ type: "error", content: msg.content });
              addActivity("error", "Error", msg.content);
              streamBufferRef.current = "";
              streamMsgIdRef.current = "";
              break;

            case "pong":
              break;

            case "chat_history": {
              // Historical messages now loaded via API; ignore WS payload
              break;
            }
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        // Suppress error message — auto-reconnect will handle it silently
        addActivity("error", "Connection error");
      };

      ws.onclose = (event) => {
        cleanup();
        if (event.code !== 1000) {
          // Auto-reconnect silently on unexpected disconnects
          isReconnectRef.current = true;
          setTimeout(() => {
            connect();
          }, 2000);
        }
      };
    } catch (error: any) {
      setIsConnecting(false);
      addMessage({
        type: "error",
        content: `Failed to connect: ${error.message || "Unknown error"}`,
      });
      addActivity("error", "Failed to connect");
    }
  }, [addMessage, updateMessage, cleanup, addActivity]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
    }
    cleanup();
    addMessage({ type: "system", content: "Disconnected." });
    addActivity("system", "Disconnected by user");
  }, [cleanup, addMessage, addActivity]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      streamBufferRef.current = "";
      streamMsgIdRef.current = "";

      addMessage({ type: "user", content });
      addActivity("user_message", "User message", content.slice(0, 60));
      setIsThinking(true);
      // Don't pre-highlight — let tool_call set the correct agent
      setActiveAgentId(null);
      wsRef.current.send(JSON.stringify({ type: "user_message", content }));
    },
    [addMessage, addActivity]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setActivityLog([]);
    setToolCallCount(0);
    sessionStorage.removeItem(storageKey(ticketKey));
  }, []);

  const newSession = useCallback(() => {
    // Disconnect existing WS
    if (wsRef.current) {
      wsRef.current.close(1000, "New session");
    }
    cleanup();
    // Clear all state
    setMessages([]);
    setActivityLog([]);
    setToolCallCount(0);
    setActiveAgentId(null);
    sessionStorage.removeItem(storageKey(ticketKey));
    // Generate new session ID immediately
    const newId = crypto.randomUUID().slice(0, 8);
    setSessionId(newId);
    pendingReconnectRef.current = true;
    return newId;
  }, [cleanup]);

  const approvePlan = useCallback(
    (planId: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "plan_approve", planId }));
      // Update the plan message status locally
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type === "plan" && m.plan?.planId === planId) {
            return { ...m, plan: { ...m.plan!, status: "executing" as const } };
          }
          return m;
        })
      );
      setIsThinking(true);
      addActivity("system", "Plan approved", planId);
    },
    [addActivity]
  );

  const rejectPlan = useCallback(
    (planId: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "plan_reject", planId }));
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type === "plan" && m.plan?.planId === planId) {
            return { ...m, plan: { ...m.plan!, status: "rejected" as const } };
          }
          return m;
        })
      );
      addActivity("system", "Plan rejected", planId);
    },
    [addActivity]
  );

  const approveEmail = useCallback(
    (draftId: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "email_approve", draftId }));
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type === "email_draft" && m.emailDraft?.draftId === draftId) {
            return { ...m, emailDraft: { ...m.emailDraft!, status: "approved" as const } };
          }
          return m;
        })
      );
      setIsThinking(true);
      addActivity("system", "Reconciliation approved", draftId);
    },
    [addActivity]
  );

  const reviseEmail = useCallback(
    (draftId: string, feedback: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(JSON.stringify({ type: "email_revise", draftId, feedback }));
      setIsThinking(true);
      addActivity("system", "Revision requested", feedback);
    },
    [addActivity]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (ticketKey) formData.append("ticketKey", ticketKey);

        const resp = await fetch("/api/upload", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.error || "Upload failed");
        }

        const data = await resp.json();

        // Tell AgentCore WebSocket about the uploaded file (with ticket context)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "upload_doc",
              s3Key: data.s3Key,
              bucket: data.bucket,
              fileName: data.fileName,
              ticketKey: ticketKey || "",
              submissionId: new URLSearchParams(window.location.search).get("submission") || "",
            })
          );
        }

        addMessage({
          type: "file_upload" as any,
          content: data.fileName,
          metadata: { size: file.size, fileName: data.fileName },
        } as any);
        addActivity("system", "PDF uploaded", data.fileName);
      } catch (error: any) {
        addMessage({
          type: "error",
          content: `Upload failed: ${error.message || "Unknown error"}`,
        });
        addActivity("error", "Upload failed", error.message);
      } finally {
        setIsUploading(false);
      }
    },
    [addMessage, addActivity]
  );

  return {
    connect,
    disconnect,
    sendMessage,
    clearMessages,
    fetchAgents,
    uploadFile,
    approvePlan,
    rejectPlan,
    approveEmail,
    reviseEmail,
    newSession,
    fetchSessions,
    loadSessionMessages,
    isConnected,
    isConnecting,
    isThinking,
    isUploading,
    messages,
    agents,
    agentsLoading,
    activityLog,
    toolCallCount,
    sessionId,
    activeAgentId,
    sessionList,
  };
}
