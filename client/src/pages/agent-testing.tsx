import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLocation } from "wouter";
import {
  Bot,
  Send,
  Plug,
  PlugZap,
  Trash2,
  AlertCircle,
  Calculator,
  User,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Brain,
  ArrowLeft,
  Cpu,
  Wrench,
  FileText,
  MessageSquare,
  Loader2,
  Paperclip,
  RotateCcw,
  Mail,
  Edit3,
  Eye,
  FileSearch,
  ScanLine,
} from "lucide-react";
import ExtractionFieldsView from "@/components/extraction-fields-view";
import {
  useAgentWebSocket,
  type AgentMessage,
  type AgentInfo,
  type ActivityEvent,
  type EmailDraftData,
  type ExtractionResultData,
  type SessionRecord,
} from "@/hooks/use-agent-websocket";
import exlLogo from "@/assets/exl-logo.svg";

// ── Icon map for dynamic agent icons ─────────────────────────────────────────

const ICON_MAP: Record<string, React.ReactNode> = {
  calculator: <Calculator className="h-5 w-5" />,
  bot: <Bot className="h-5 w-5" />,
  wrench: <Wrench className="h-5 w-5" />,
  file: <FileText className="h-5 w-5" />,
  cpu: <Cpu className="h-5 w-5" />,
  ticket: <MessageSquare className="h-5 w-5" />,
  brain: <Brain className="h-5 w-5" />,
  mail: <Mail className="h-5 w-5" />,
  scan: <ScanLine className="h-5 w-5" />,
  "message-square": <MessageSquare className="h-5 w-5" />,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseThinking(raw: string): { thinking: string; response: string } {
  const thinkRegex = /<thinking>([\s\S]*?)<\/thinking>/gi;
  const parts: string[] = [];
  let match;
  while ((match = thinkRegex.exec(raw)) !== null) parts.push(match[1].trim());
  let response = raw
    .replace(thinkRegex, "")
    .replace(/<\/?(?:toolResult|toolUse|tool|result|response|function_calls|invoke|parameter|antml:)[^>]*>/gi, "")
    .trim();
  return { thinking: parts.join("\n"), response };
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function AgentTesting() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ fileName: string; size: number; timestamp: Date; status: "uploading" | "processing" | "ready"; blobUrl?: string }>>([]);
  const [activeDocIndex, setActiveDocIndex] = useState<number>(0);
  const ticketSentRef = useRef(false);

  // Read ?ticket= or ?submission= from URL
  const urlParams = new URLSearchParams(window.location.search);
  const ticketKey = urlParams.get("ticket");
  const submissionId = urlParams.get("submission");
  const workflowType = urlParams.get("workflow") || (submissionId ? "submissions" : undefined);

  const {
    connect,
    disconnect,
    sendMessage,
    clearMessages,
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
  } = useAgentWebSocket(ticketKey || submissionId || undefined, workflowType);

  const [showSessionList, setShowSessionList] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [extractions, setExtractions] = useState<Array<{extraction_id: string; status: string; created_at: string; document_name: string; field_count: number; approved_count: number}>>([]);
  const [extractionsLoading, setExtractionsLoading] = useState(false);
  const [showDataView, setShowDataView] = useState(!!submissionId);
  const [activeExtractionData, setActiveExtractionData] = useState<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Auto-connect and send ticket context when arriving from dashboard
  useEffect(() => {
    if (ticketKey && !ticketSentRef.current && isConnected) {
      ticketSentRef.current = true;
      sendMessage(`Get details of ticket ${ticketKey}, read its comments, and summarize the discussion`);
    }
  }, [ticketKey, isConnected, sendMessage]);

  // Load existing documents for this ticket from S3 (with presigned URLs)
  useEffect(() => {
    if (!ticketKey) return;
    fetch(`/api/documents/${ticketKey}`, { credentials: "include" })
      .then((r) => r.json())
      .then(async (docs: Array<{ key: string; fileName: string; size: number; lastModified: string }>) => {
        if (docs.length > 0) {
          // Use proxy URLs — same-origin, no CORS, works with embed
          const docsWithUrls = docs.map((d) => ({
            fileName: d.fileName || d.key.split("/").pop() || "document.pdf",
            size: d.size || 0,
            timestamp: new Date(d.lastModified),
            status: "ready" as const,
            blobUrl: `/api/pdf-proxy?key=${encodeURIComponent(d.key)}`,
          }));
          setUploadedDocs((prev) => {
            const existingNames = new Set(prev.map((p) => p.fileName));
            const newDocs = docsWithUrls.filter((d) => !existingNames.has(d.fileName));
            return [...prev, ...newDocs];
          });
        }
      })
      .catch(() => {});
  }, [ticketKey]);

  // Load documents for submission workflow from DynamoDB
  useEffect(() => {
    if (!submissionId) return;
    fetch(`/api/submissions/${submissionId}/documents`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((docs: any[]) => {
        if (!docs || docs.length === 0) return;
        const docsWithUrls = docs.map((d: any) => {
          if (d.doc_type === "email") {
            return {
              fileName: "Email Message",
              size: Number(d.size_bytes) || 0,
              timestamp: new Date(d.created_at || Date.now()),
              status: "ready" as const,
              blobUrl: `/api/submissions/${submissionId}/email-body`,
            };
          }
          // Use presigned URL directly from S3 — no proxy overhead
          const fname = d.filename || "document";
          const isPdf = fname.toLowerCase().endsWith(".pdf");
          const directUrl = d.pdf_presigned_url || d.presigned_url;
          return {
            fileName: fname,
            size: Number(d.size_bytes) || 0,
            timestamp: new Date(d.created_at || Date.now()),
            status: "ready" as const,
            blobUrl: directUrl,
            canPreview: isPdf || !!d.pdf_presigned_url,
          };
        });
        setUploadedDocs(docsWithUrls);
      })
      .catch(() => {});
  }, [submissionId]);

  // Auto-connect and fetch sessions when ticket or submission is set
  useEffect(() => {
    const key = ticketKey || submissionId;
    if (key && !isConnected) {
      connect();
      setIsLoadingSessions(true);
      fetchSessions(key).then((sessions) => {
        if (sessions.length > 0) {
          return loadSessionMessages(key, sessions[0].session_id);
        }
      }).finally(() => setIsLoadingSessions(false));
    }
  }, [ticketKey, submissionId]);

  const formatSessionDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHr = Math.floor(diffMs / 3600000);
      const diffDay = Math.floor(diffMs / 86400000);
      if (diffMin < 1) return "Just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch { return iso; }
  };

  const fetchExtractions = useCallback(async () => {
    if (!ticketKey && !submissionId) return;
    setExtractionsLoading(true);
    try {
      const url = submissionId
        ? `/api/submissions/${submissionId}/extractions`
        : `/api/extractions/list/${ticketKey}`;
      const resp = await fetch(url, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        setExtractions(data);
      }
    } catch {}
    setExtractionsLoading(false);
  }, [ticketKey, submissionId]);

  // Auto-fetch extractions on page load
  useEffect(() => {
    if (submissionId) {
      // For submissions, fetch full extraction directly
      setExtractionsLoading(true);
      fetch(`/api/submissions/${submissionId}/extraction`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          setExtractions([{ extraction_id: data.extraction_id, email_id: data.email_id, document_name: data.document_name || "", status: data.status || "pending_review", created_at: data.created_at || "", field_count: (data.extracted_data || []).length, approved_count: (data.extracted_data || []).filter((f: any) => f.field_status === "approved").length }]);
          setActiveExtractionData(data);
        })
        .catch(() => {})
        .finally(() => setExtractionsLoading(false));
    } else if (ticketKey) {
      fetchExtractions();
    }
  }, [ticketKey, submissionId, fetchExtractions]);

  const toggleDataView = useCallback(async () => {
    if (showDataView) {
      setShowDataView(false);
      return;
    }
    if (!ticketKey && !submissionId) return;
    setShowDataView(true);
    // Use cached data if available, fetch in background if not
    if (activeExtractionData) return;
    setExtractionsLoading(true);
    try {
      const url = submissionId
        ? `/api/submissions/${submissionId}/extraction`
        : `/api/extractions/list/${ticketKey}`;
      const resp = await fetch(url, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        if (submissionId) {
          // Single extraction object returned directly
          setExtractions([{ extraction_id: data.extraction_id, email_id: data.email_id, document_name: data.document_name || "", status: data.status || "pending_review", created_at: data.created_at || "", field_count: (data.extracted_data || []).length, approved_count: (data.extracted_data || []).filter((f: any) => f.field_status === "approved").length }]);
          setActiveExtractionData(data);
        } else {
          setExtractions(data);
          if (data.length > 0) {
            const fullResp = await fetch(`/api/extractions/${data[0].extraction_id}?ticketKey=${ticketKey}`, { credentials: "include" });
            if (fullResp.ok) setActiveExtractionData(await fullResp.json());
          }
        }
      }
    } catch {}
    setExtractionsLoading(false);
  }, [showDataView, ticketKey, submissionId, activeExtractionData]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !isConnected) return;
    sendMessage(text);
    setInput("");
  };

  const handleExampleClick = (example: string) => {
    if (!isConnected) return;
    sendMessage(example);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      setUploadedDocs((prev) => {
        const updated = [...prev, { fileName: file.name, size: file.size, timestamp: new Date(), status: "uploading" as const, blobUrl }];
        setActiveDocIndex(updated.length - 1);
        return updated;
      });
      uploadFile(file);
      e.target.value = "";
    }
  };

  // Update doc status based on system messages
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.type !== "system") return;
    const c = (last.content || "").toLowerCase();
    if (c.includes("processing") || c.includes("extracting")) {
      setUploadedDocs((prev) => prev.map((d, i) => i === prev.length - 1 ? { ...d, status: "processing" as const } : d));
    } else if (c.includes("ready") || c.includes("ingested")) {
      setUploadedDocs((prev) => prev.map((d, i) => i === prev.length - 1 ? { ...d, status: "ready" as const } : d));
    }
  }, [messages]);

  const userMessageCount = messages.filter((m) => m.type === "user").length;

  return (
    <PanelGroup direction="horizontal" className="h-screen bg-background">
      {/* ── Left Panel: Agent Sidebar ── */}
      <Panel defaultSize={20} minSize={15} maxSize={30} className="overflow-hidden flex flex-col border-r border-border">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setLocation(submissionId ? "/submissions" : "/dashboard")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <img src={exlLogo} alt="EXL" className="h-8 w-auto" />
              <div>
                <div className="text-sm font-semibold text-foreground">Underwriting Platform</div>
                <div className="text-xs text-muted-foreground">AI-Powered</div>
              </div>
            </div>
          </div>

          {/* Available Agents */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Available Agents
            </h3>

            {agentsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Discovering agents...
              </div>
            ) : agents.length === 0 ? (
              <p className="text-xs text-muted-foreground">No agents discovered. Start AgentCore first.</p>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} onExampleClick={handleExampleClick} isConnected={isConnected} isActive={activeAgentId === agent.id} />
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border flex-shrink-0">
            <Badge variant="outline" className="text-xs w-full justify-center">
              Multi-Agent Orchestrator
            </Badge>
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-col-resize" />

      {/* ── Center Panel: Chat ── */}
      <Panel defaultSize={55} minSize={35} className="overflow-hidden flex flex-col">
        {/* Chat Header */}
        <div className="bg-card border-b border-border px-4 py-3 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Chat</h2>
            <div className="relative">
              <button
                onClick={() => { if (ticketKey) { fetchSessions(ticketKey); setShowSessionList(!showSessionList); } }}
                className="text-xs text-muted-foreground font-mono hover:text-foreground transition-colors cursor-pointer flex items-center gap-1"
              >
                Session: {viewingSessionId || sessionId} {sessionList.length > 0 && <ChevronDown className="h-3 w-3" />}
              </button>
              {showSessionList && sessionList.length > 0 && (
                <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 w-72 max-h-64 overflow-y-auto">
                  {sessionList.map((s) => (
                    <div
                      key={s.session_id}
                      onClick={() => {
                        if (ticketKey) loadSessionMessages(ticketKey, s.session_id);
                        setViewingSessionId(s.session_id);
                        setShowSessionList(false);
                      }}
                      className={`px-3 py-2 hover:bg-muted cursor-pointer text-xs border-b border-border last:border-b-0 ${s.session_id === (viewingSessionId || sessionId) ? "bg-muted/50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold font-mono text-foreground">{s.session_id}</span>
                        <span className="text-[10px] text-muted-foreground">{formatSessionDate(s.last_active)}</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 flex items-center gap-1">
                        <span>{s.message_count} msgs</span>
                        {s.summary && <span className="truncate">· {s.summary}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {ticketKey && (
              <Badge variant="outline" className="text-xs font-mono font-semibold text-primary border-primary/30 gap-1.5 px-2.5 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                {ticketKey}
              </Badge>
            )}
            {isThinking && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge className="bg-green-100 text-green-800 text-xs">Connected</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-800 text-xs">Offline</Badge>
            )}
            {isConnected ? (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={disconnect}>
                <PlugZap className="h-3 w-3 mr-1" /> Disconnect
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={connect} disabled={isConnecting}>
                <Plug className="h-3 w-3 mr-1" /> {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7" onClick={clearMessages}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setViewingSessionId(null); newSession(); }}>
              <RotateCcw className="h-3 w-3 mr-1" /> New Session
            </Button>
            {(ticketKey || submissionId) && (
              <Button
                variant={showDataView ? "default" : "outline"}
                size="sm"
                className={`h-7 text-xs ${showDataView ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}`}
                onClick={toggleDataView}
              >
                <ScanLine className="h-3 w-3 mr-1" /> {showDataView ? "Chat" : "Data"}
              </Button>
            )}
          </div>
        </div>

        {/* Data Form View (toggle) */}
        {showDataView && (
          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
            {extractionsLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-primary" />
                <p className="text-xs">Loading extraction data...</p>
              </div>
            )}

            {!extractionsLoading && extractions.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FileSearch className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">No extractions found</p>
                <p className="text-xs mt-1 opacity-60">Upload a PDF and ask to extract data first</p>
              </div>
            )}

            {!extractionsLoading && extractions.length > 0 && (
              <div className="space-y-3">
                {/* Extraction Selector */}
                {extractions.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {extractions.map((ext) => (
                      <button
                        key={ext.extraction_id}
                        onClick={async () => {
                          try {
                            const resp = await fetch(`/api/extractions/${ext.extraction_id}?ticketKey=${ticketKey}`, { credentials: "include" });
                            setActiveExtractionData(await resp.json());
                          } catch {}
                        }}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs border transition-colors ${
                          activeExtractionData?.extraction_id === ext.extraction_id
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-card border-border hover:bg-muted"
                        }`}
                      >
                        {ext.document_name.slice(0, 20)}{ext.document_name.length > 20 ? "..." : ""}
                      </button>
                    ))}
                  </div>
                )}

                {/* Extraction Fields Form */}
                {activeExtractionData?.extracted_data && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold">{activeExtractionData.s3_key?.split("/").pop() || "Extraction"}</h3>
                        <p className="text-[10px] text-muted-foreground">
                          {activeExtractionData.extracted_data.length} fields ·
                          {activeExtractionData.extracted_data.filter((f: any) => f.field_status === "approved").length} approved
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={`text-[9px] h-5 ${
                          activeExtractionData.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                          activeExtractionData.status === "rejected" ? "bg-red-100 text-red-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {activeExtractionData.status === "pending_review" ? "Pending Review" : activeExtractionData.status}
                        </Badge>
{/* Full View button removed */}
                      </div>
                    </div>

                    {/* Shared extraction fields component — single source of truth */}
                    <ExtractionFieldsView fields={activeExtractionData.extracted_data} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Messages (hidden when data view is active) */}
        {!showDataView && (
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          <div className="space-y-2">
            {isLoadingSessions && messages.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary opacity-60" />
                <p className="text-sm font-medium">Loading session history...</p>
                <p className="text-xs mt-1 opacity-60">Fetching previous conversations{ticketKey ? ` for ${ticketKey}` : ""}</p>
              </div>
            )}

            {!isLoadingSessions && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-100 to-orange-50 dark:from-orange-950/40 dark:to-orange-900/20 flex items-center justify-center mb-4 shadow-sm">
                  <Bot className="h-7 w-7 text-orange-500" />
                </div>
                {isConnected ? (
                  <>
                    <p className="text-sm font-semibold text-foreground mb-1">AI Underwriting Assistant</p>
                    <p className="text-xs text-muted-foreground mb-5 max-w-xs text-center">
                      Analyze submissions, run sanctions checks, compare peers, and draft emails — all powered by AI agents.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-md">
                      {["Summarize this submission", "Run cross-sell analysis", "Run peer comparison", "Run sanctions check"].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          className="text-xs px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted hover:border-orange-300 transition-colors text-foreground"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium mb-1">Not connected</p>
                    <p className="text-xs opacity-60">Click <strong>Connect</strong> to start the AI orchestrator</p>
                  </>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} onApprovePlan={approvePlan} onRejectPlan={rejectPlan} onApproveEmail={approveEmail} onReviseEmail={reviseEmail} />
            ))}

            {isThinking && (
              <div className="flex items-center gap-2 pl-2">
                <div className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1.5">
                  {activeAgentId ? (
                    <>
                      {ICON_MAP[agents.find(a => a.id === activeAgentId)?.icon || ""] || <Bot className="h-3 w-3 text-green-600" />}
                      <span className="text-xs text-muted-foreground">
                        {agents.find(a => a.id === activeAgentId)?.name || "Agent"} is working
                      </span>
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3 text-green-600" />
                      <span className="text-xs text-muted-foreground">Orchestrator is thinking</span>
                    </>
                  )}
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
        )}

        {/* Input */}
        <div className="border-t border-border px-4 py-3 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={!isConnected || isUploading}
              title="Upload PDF"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Input
              placeholder={isConnected ? "Type a message..." : "Connect to start..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isConnected || isThinking}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!isConnected || !input.trim() || isThinking} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Panel>

      <PanelResizeHandle className="w-1 bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-col-resize" />

      {/* ── Right Panel: Activity ── */}
      <Panel defaultSize={25} minSize={18} maxSize={35} className="overflow-hidden flex flex-col border-l border-border">
        <Tabs defaultValue="activity" className="flex flex-col h-full">
          <div className="border-b border-border px-4 pt-2 flex-shrink-0">
            <TabsList className="bg-transparent p-0 h-auto gap-4">
              <TabsTrigger value="activity" className="text-xs font-semibold uppercase tracking-wide data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 pb-2">
                Activity
                {activityLog.length > 0 && (
                  <Badge className="ml-1.5 bg-blue-100 text-blue-800 text-xs h-4 min-w-4 px-1">{activityLog.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-xs font-semibold uppercase tracking-wide data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none px-1 pb-2">
                Documents
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="activity" className="flex-1 overflow-y-auto m-0 p-4">
            {activityLog.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center mt-8">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {activityLog.map((event) => (
                  <ActivityItem key={event.id} event={event} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="documents" className="flex-1 overflow-hidden m-0 flex flex-col">
            {uploadedDocs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <p className="text-xs text-muted-foreground">No documents uploaded</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Upload a PDF to view it here</p>
                </div>
              </div>
            ) : (
              <>
                {/* Document tabs */}
                <div className="flex items-center border-b border-border overflow-x-auto flex-shrink-0">
                  {uploadedDocs.map((doc, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveDocIndex(i)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-[11px] border-r border-border whitespace-nowrap transition-colors ${
                        activeDocIndex === i
                          ? "bg-background text-foreground border-b-2 border-b-blue-600"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <svg className="w-3 h-3 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="truncate max-w-[120px]">{doc.fileName}</span>
                      {doc.status === "ready" ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                      ) : (
                        <svg className="animate-spin h-3 w-3 text-muted-foreground flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>

                {/* Document Viewer — all docs stay mounted, active one on top via z-index */}
                <div className="flex-1 overflow-hidden bg-muted/20 relative">
                  {uploadedDocs.map((doc, i) => (
                    <div
                      key={`doc-${i}-${doc.fileName}`}
                      className="absolute inset-0"
                      style={{
                        zIndex: i === activeDocIndex ? 1 : 0,
                        opacity: i === activeDocIndex ? 1 : 0,
                        pointerEvents: i === activeDocIndex ? "auto" : "none",
                      }}
                    >
                      {doc.blobUrl ? (
                        doc.blobUrl.includes("email-body") ? (
                          <iframe
                            src={doc.blobUrl}
                            className="w-full h-full border-0 bg-white"
                            sandbox="allow-same-origin"
                            title="Email content"
                          />
                        ) : (doc as any).canPreview !== false ? (
                          <iframe
                            src={`${doc.blobUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH&zoom=page-width`}
                            className="w-full h-full border-0"
                            title={doc.fileName}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full gap-3">
                            <FileText className="h-10 w-10 text-muted-foreground opacity-40" />
                            <p className="text-sm font-medium text-muted-foreground">{doc.fileName}</p>
                            <p className="text-xs text-muted-foreground">Preview not available for this file type</p>
                            <a href={doc.blobUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Download file</a>
                          </div>
                        )
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                          <p className="text-xs text-muted-foreground">Loading document...</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Doc info bar */}
                <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-muted/30 flex-shrink-0">
                  <span className="text-[10px] text-muted-foreground">
                    {uploadedDocs[activeDocIndex]?.fileName}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {uploadedDocs[activeDocIndex]?.size > 1024 * 1024
                      ? `${(uploadedDocs[activeDocIndex].size / (1024 * 1024)).toFixed(1)} MB`
                      : `${(uploadedDocs[activeDocIndex].size / 1024).toFixed(0)} KB`}
                  </span>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </Panel>
    </PanelGroup>
  );
}

// ── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, onExampleClick, isConnected, isActive }: { agent: AgentInfo; onExampleClick: (s: string) => void; isConnected: boolean; isActive: boolean }) {
  return (
    <Card className={`bg-card transition-all duration-300 ${isActive ? "ring-2 ring-green-500 shadow-lg shadow-green-500/20 bg-green-50/5" : ""}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${isActive ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"}`}>
            {ICON_MAP[agent.icon] || <Bot className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-foreground">{agent.name}</span>
              {isActive && (
                <span className="flex items-center gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 font-medium">Working</span>
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{agent.description}</div>
          </div>
        </div>

        <ul className="text-xs text-muted-foreground space-y-0.5 mb-2 pl-1">
          {agent.capabilities.map((cap, i) => (
            <li key={i} className="flex items-start gap-1">
              <span className="text-muted-foreground/60 mt-0.5">·</span>
              {cap}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-1">
          {agent.examples.map((ex, i) => (
            <button
              key={i}
              onClick={() => onExampleClick(ex)}
              disabled={!isConnected}
              className="text-xs bg-muted hover:bg-accent text-muted-foreground hover:text-foreground rounded-full px-2.5 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              &quot;{ex}&quot;
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chat Message ─────────────────────────────────────────────────────────────

function ChatMessage({ message, onApprovePlan, onRejectPlan, onApproveEmail, onReviseEmail }: {
  message: AgentMessage;
  onApprovePlan?: (planId: string) => void;
  onRejectPlan?: (planId: string) => void;
  onApproveEmail?: (draftId: string) => void;
  onReviseEmail?: (draftId: string, feedback: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const time = formatTime(message.timestamp);

  switch (message.type) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[85%]">
            <p className="text-sm">{message.content}</p>
            <p className="text-xs text-blue-200 mt-1 text-right">{time}</p>
          </div>
        </div>
      );

    case "agent": {
      const { thinking, response } = parseThinking(message.content);
      return (
        <div className="flex items-start gap-2">
          <div className="h-6 w-6 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center flex-shrink-0 mt-1">
            <Bot className="h-3.5 w-3.5 text-green-600" />
          </div>
          <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-green-600">Orchestrator</span>
              <span className="text-xs text-muted-foreground">{time}</span>
            </div>

            {thinking && (
              <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none">
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Brain className="h-3 w-3" />
                  <span>Thinking</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1.5 pl-3 border-l-2 border-muted text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {thinking}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {response && (
              <div className="text-sm text-foreground leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-table:text-xs prose-th:bg-muted/50 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-table:border prose-th:border prose-td:border">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{response}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      );
    }

    case "tool_call":
      return (
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-start gap-2 pl-8">
            <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2">
              <CollapsibleTrigger className="w-full cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  {open ? <ChevronDown className="h-3 w-3 text-orange-500" /> : <ChevronRight className="h-3 w-3 text-orange-500" />}
                  <Wrench className="h-3 w-3 text-orange-500" />
                  <span className="text-xs font-medium">Tool Call</span>
                  <Badge className="bg-orange-100 text-orange-800 text-xs h-5">{message.tool}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{time}</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 text-xs font-mono text-muted-foreground bg-muted/50 rounded px-3 py-2 overflow-x-auto">
                  {message.tool}({JSON.stringify(message.toolInput, null, 2)})
                </pre>
              </CollapsibleContent>
            </div>
          </div>
        </Collapsible>
      );

    case "tool_result":
      return (
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-start gap-2 pl-8">
            <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2">
              <CollapsibleTrigger className="w-full cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  {open ? <ChevronDown className="h-3 w-3 text-emerald-500" /> : <ChevronRight className="h-3 w-3 text-emerald-500" />}
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs font-medium">Result</span>
                  <Badge className="bg-emerald-100 text-emerald-800 text-xs h-5">{message.tool}</Badge>
                  <span className="text-xs font-mono font-bold ml-1">= {message.toolResult}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{time}</span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 text-xs font-mono text-muted-foreground bg-muted/50 rounded px-3 py-2">
                  {message.toolResult}
                </pre>
              </CollapsibleContent>
            </div>
          </div>
        </Collapsible>
      );

    case "plan": {
      const plan = message.plan;
      if (!plan) return null;
      const isAwaiting = plan.status === "awaiting_approval";
      const isExecuting = plan.status === "executing";
      const isCompleted = plan.status === "completed";
      const isRejected = plan.status === "rejected";

      return (
        <div className="flex items-start gap-2">
          <div className="h-6 w-6 rounded-full bg-purple-100 dark:bg-purple-950 flex items-center justify-center flex-shrink-0 mt-1">
            <Brain className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <div className={`w-full max-w-[90%] border rounded-2xl rounded-bl-sm px-4 py-3 transition-all ${
            isAwaiting ? "bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800" :
            isExecuting ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" :
            isCompleted ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
            "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
          }`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Execution Plan</span>
              {plan.source === "webhook" && (
                <Badge className="text-xs h-5 bg-orange-100 text-orange-800 border border-orange-300">
                  ⚡ Webhook {plan.ticketKey ? `• ${plan.ticketKey}` : ""}
                </Badge>
              )}
              <Badge className={`text-xs h-5 ${
                isAwaiting ? "bg-yellow-100 text-yellow-800" :
                isExecuting ? "bg-blue-100 text-blue-800" :
                isCompleted ? "bg-green-100 text-green-800" :
                "bg-red-100 text-red-800"
              }`}>
                {isAwaiting ? "Awaiting Approval" :
                 isExecuting ? "Executing..." :
                 isCompleted ? "Completed" :
                 "Rejected"}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">{time}</span>
            </div>

            {/* Goal */}
            <div className="mb-3">
              <span className="text-xs text-muted-foreground font-medium">Goal:</span>
              <p className="text-sm text-foreground font-medium mt-0.5">{plan.goal}</p>
            </div>

            {/* Steps */}
            <div className="space-y-1.5 mb-3">
              {plan.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step.status === "completed" ? "bg-green-100 text-green-700" :
                    step.status === "executing" ? "bg-blue-100 text-blue-700" :
                    step.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {step.status === "completed" ? (
                      <CheckCircle className="h-3 w-3" />
                    ) : step.status === "executing" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-sm ${
                    step.status === "completed" ? "text-green-700 line-through opacity-70" :
                    step.status === "executing" ? "text-blue-700 font-medium" :
                    step.status === "failed" ? "text-red-600" :
                    "text-foreground"
                  }`}>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Approve / Reject buttons */}
            {isAwaiting && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                <Button
                  size="sm"
                  className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                  onClick={() => onApprovePlan?.(plan.planId)}
                >
                  <CheckCircle className="h-3 w-3 mr-1" /> Approve & Execute
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => onRejectPlan?.(plan.planId)}
                >
                  <AlertCircle className="h-3 w-3 mr-1" /> Reject
                </Button>
              </div>
            )}

            {isExecuting && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                <span className="text-xs text-blue-600 font-medium">Executing plan...</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    case "error":
      return (
        <div className="flex items-start gap-2 pl-8">
          <div className="w-full bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span className="text-xs font-medium text-red-600">Error</span>
              <span className="text-xs text-muted-foreground ml-auto">{time}</span>
            </div>
            <p className="text-xs text-red-600 mt-1">{message.content}</p>
          </div>
        </div>
      );

    case "email_draft": {
      const draft = message.emailDraft;
      if (!draft) return null;
      const isReviewing = draft.status === "reviewing";
      const isApproved = draft.status === "approved";
      const isSent = draft.status === "sent";
      const isEmail = !!(draft as any).to || !!(draft as any).subject;
      const [showFeedback, setShowFeedback] = useState(false);
      const [feedbackText, setFeedbackText] = useState("");

      return (
        <div className="flex items-start gap-2">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${isEmail ? "bg-orange-100 dark:bg-orange-950" : "bg-blue-100 dark:bg-blue-950"}`}>
            {isEmail ? <Mail className="h-3.5 w-3.5 text-orange-600" /> : <MessageSquare className="h-3.5 w-3.5 text-blue-600" />}
          </div>
          <div className={`w-full max-w-[90%] border rounded-2xl rounded-bl-sm px-4 py-3 transition-all ${
            isReviewing ? "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" :
            isApproved ? "bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800" :
            "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
          }`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              {isEmail ? <Mail className="h-4 w-4 text-orange-600" /> : <MessageSquare className="h-4 w-4 text-blue-600" />}
              <span className={`text-xs font-semibold uppercase tracking-wide ${isEmail ? "text-orange-600" : "text-blue-600"}`}>{isEmail ? "Email Draft" : "Jira comment draft"}</span>
              {draft.revisionCount > 0 && (
                <Badge className="text-xs h-5 bg-purple-100 text-purple-800">
                  Rev {draft.revisionCount}
                </Badge>
              )}
              <Badge className={`text-xs h-5 ${
                isReviewing ? "bg-yellow-100 text-yellow-800" :
                isApproved ? "bg-blue-100 text-blue-800" :
                "bg-green-100 text-green-800"
              }`}>
                {isReviewing ? "Awaiting Review" : isApproved ? (isEmail ? "Sending..." : "Posting...") : (isEmail ? "Email Sent" : "Posted to Jira")}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">{time}</span>
            </div>

            {(draft.ticketKey || draft.label || draft.subject || (draft as any).to) && (
              <div className="space-y-1 mb-3 text-sm text-muted-foreground">
                {isEmail && (draft as any).to && (
                  <div>
                    <span className="font-medium text-foreground">To: </span>
                    {(draft as any).to}
                  </div>
                )}
                {isEmail && (draft as any).subject && (
                  <div>
                    <span className="font-medium text-foreground">Subject: </span>
                    {(draft as any).subject}
                  </div>
                )}
                {!isEmail && draft.ticketKey && (
                  <div>
                    <span className="font-medium text-foreground">Ticket: </span>
                    {draft.ticketKey}
                  </div>
                )}
                {!isEmail && (draft.label || draft.subject) && (
                  <div className="italic">
                    {draft.label || draft.subject}
                  </div>
                )}
              </div>
            )}

            {/* Comment body */}
            <div className="bg-background/60 rounded-lg p-3 mb-3 border border-border/50">
              <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.body}</ReactMarkdown>
              </div>
            </div>

            {/* Actions */}
            {isReviewing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
                    onClick={() => onApproveEmail?.(draft.draftId)}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" /> {isEmail ? "Approve & Send Email" : "Approve & Post to Jira"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                    onClick={() => setShowFeedback(!showFeedback)}
                  >
                    <Edit3 className="h-3 w-3 mr-1" /> Request Changes
                  </Button>
                </div>
                {showFeedback && (
                  <div className="flex gap-2">
                    <Input
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Describe changes needed..."
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && feedbackText.trim()) {
                          onReviseEmail?.(draft.draftId, feedbackText.trim());
                          setFeedbackText("");
                          setShowFeedback(false);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!feedbackText.trim()}
                      onClick={() => {
                        if (feedbackText.trim()) {
                          onReviseEmail?.(draft.draftId, feedbackText.trim());
                          setFeedbackText("");
                          setShowFeedback(false);
                        }
                      }}
                    >
                      Submit
                    </Button>
                  </div>
                )}
              </div>
            )}

            {isSent && (
              <div className="flex items-center gap-2 pt-2 border-t border-border/50 text-green-600 text-sm">
                <CheckCircle className="h-4 w-4" />
                <span>Comment posted to Jira</span>
              </div>
            )}
          </div>
        </div>
      );
    }

    case "file_upload": {
      const meta = (message as any).metadata || {};
      const fileName = meta.fileName || message.content || "document.pdf";
      const fileSize = meta.size
        ? meta.size > 1024 * 1024
          ? `${(meta.size / (1024 * 1024)).toFixed(1)} MB`
          : `${(meta.size / 1024).toFixed(0)} KB`
        : "";

      return (
        <div className="flex justify-end">
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2.5 max-w-[300px]">
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-foreground truncate">{fileName}</span>
              {fileSize && <span className="text-[10px] text-muted-foreground">{fileSize}</span>}
            </div>
          </div>
        </div>
      );
    }

    case "system": {
      const content = message.content || "";
      const isProcessing = content.toLowerCase().includes("processing") || content.toLowerCase().includes("extracting");
      const isReady = content.toLowerCase().includes("ready") || content.toLowerCase().includes("ingested");
      const isUpload = content.toLowerCase().includes("uploaded");

      // Show "ready" as a clean short confirmation
      if (isReady) {
        return (
          <div className="flex justify-end pr-2">
            <span className="text-[11px] text-muted-foreground/60">Document ready for analysis</span>
          </div>
        );
      }

      // Upload and processing messages align right (user action), others left
      const isUserAction = isUpload || isProcessing;

      return (
        <div className={`flex ${isUserAction ? "justify-end pr-2" : "justify-start pl-2"}`}>
          <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
            {isProcessing && (
              <svg className="animate-spin h-3 w-3 text-muted-foreground/50" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isProcessing ? "Processing document..." : content}
          </span>
        </div>
      );
    }

    case "data_extraction": {
      const ext = message.extraction;
      if (!ext) return null;
      return (
        <div className="flex items-start gap-2">
          <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0 mt-1">
            <FileSearch className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <div className="w-full max-w-[90%] border rounded-2xl rounded-bl-sm px-4 py-3 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-2 mb-2">
              <FileSearch className="h-4 w-4 text-indigo-600" />
              <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Data Extraction</span>
              <Badge className="text-xs h-5 bg-indigo-100 text-indigo-800">
                {ext.fieldCount} fields
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">{time}</span>
            </div>
            <p className="text-sm text-foreground mb-3">
              Structured data extracted from the uploaded document. Review and validate the extracted fields.
            </p>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={() => {
                const ticketParam = ext.ticketKey ? `?ticket=${ext.ticketKey}` : "";
                window.location.href = `/data-validation/${ext.extractionId}${ticketParam}`;
              }}
            >
              <Eye className="h-4 w-4 mr-1" /> Open Validation Page
            </Button>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

// ── Activity Item ────────────────────────────────────────────────────────────

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  user_message: <User className="h-3.5 w-3.5 text-blue-500" />,
  tool_call: <Wrench className="h-3.5 w-3.5 text-orange-500" />,
  agent_response: <Bot className="h-3.5 w-3.5 text-green-500" />,
  system: <Cpu className="h-3.5 w-3.5 text-muted-foreground" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
};

function ActivityItem({ event }: { event: ActivityEvent }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="mt-0.5 flex-shrink-0">{ACTIVITY_ICONS[event.type] || <Cpu className="h-3.5 w-3.5" />}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground truncate">{event.label}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">{formatTime(event.timestamp)}</span>
        </div>
        {event.detail && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{event.detail}</p>
        )}
      </div>
    </div>
  );
}
