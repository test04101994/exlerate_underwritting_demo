import React, { useState, useMemo, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import {
  Mail,
  Paperclip,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Inbox,
  Calendar,
  Bot,
  PanelLeftOpen,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StaticSidebar } from "@/components/shared/StaticSidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface FileEntry {
  sub_guid: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  type: string;
}

interface Submission {
  email_id: string;
  received_at: string;
  processed_at: string;
  from_address: string;
  to_addresses: string[];
  subject: string;
  message_id: string;
  s3_bucket: string;
  s3_prefix: string;
  files: FileEntry[];
  attachment_count: number;
  raw_size_bytes: number;
  status: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

// ── Document Viewer Component ────────────────────────────────────────────────

interface DocumentRecord {
  document_id: string;
  email_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  s3_uri: string;
  s3_key: string;
  doc_type: string;
  presigned_url?: string;
  pdf_s3_key?: string;
  pdf_s3_uri?: string;
  pdf_presigned_url?: string;
  pdf_size_bytes?: number;
  created_at: string;
}

function DocumentViewer({ emailId, submission }: { emailId: string; submission: Submission }) {
  const { data: documents, isLoading } = useQuery<DocumentRecord[]>({
    queryKey: [`/api/submissions/${emailId}/documents`],
    staleTime: 60000,
  });

  return (
    <div className="space-y-3">
      {/* Email metadata */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Email ID:</span>{" "}
          <span className="font-mono text-[10px]">{submission.email_id}</span>
        </div>
        <div>
          <span className="text-muted-foreground">To:</span>{" "}
          {submission.to_addresses?.join(", ") || "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Processed:</span>{" "}
          {submission.processed_at ? `${formatDate(submission.processed_at)} ${formatTime(submission.processed_at)}` : "—"}
        </div>
      </div>

      {/* Documents table */}
      <div>
        <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-orange-500" />
          Documents
          {documents && <span className="text-muted-foreground font-normal">({documents.length})</span>}
        </div>

        {isLoading ? (
          <div className="space-y-1.5">
            {[1, 2].map(i => <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />)}
          </div>
        ) : !documents || documents.length === 0 ? (
          <div className="text-xs text-muted-foreground py-2">No documents found — they will appear after email processing.</div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-card">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b text-[10px] text-muted-foreground uppercase tracking-wider">
                  <th className="py-1.5 px-3 text-left font-medium">Document ID</th>
                  <th className="py-1.5 px-3 text-left font-medium">Filename</th>
                  <th className="py-1.5 px-3 text-left font-medium">Type</th>
                  <th className="py-1.5 px-3 text-left font-medium">Size</th>
                  <th className="py-1.5 px-3 text-left font-medium">PDF</th>
                  <th className="py-1.5 px-3 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.document_id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-2 px-3">
                      <span className="font-mono text-[10px] text-primary">
                        {doc.document_id}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        {doc.doc_type === "attachment" ? (
                          <Paperclip className="h-3 w-3 text-blue-500" />
                        ) : (
                          <Mail className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="break-all">{doc.filename}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{doc.doc_type}</Badge>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{formatBytes(doc.size_bytes)}</td>
                    <td className="py-2 px-3">
                      {doc.pdf_presigned_url ? (
                        <Badge className="text-[9px] px-1.5 py-0 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          PDF Ready
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {doc.presigned_url && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={(e) => { e.stopPropagation(); window.open(doc.presigned_url, "_blank"); }}
                          >
                            Original
                          </Button>
                        )}
                        {doc.pdf_presigned_url && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 px-2 text-[10px] text-orange-600"
                            onClick={(e) => { e.stopPropagation(); window.open(doc.pdf_presigned_url, "_blank"); }}
                          >
                            View PDF
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function SubmissionsQueue() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const perPage = 15;
  const { toast } = useToast();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Logout failed");
      return r.json();
    },
    onSuccess: () => { queryClient.clear(); setLocation("/login"); },
  });

  const { data: submissions, isLoading, refetch, isFetching } = useQuery<Submission[]>({
    queryKey: ["/api/submissions"],
    staleTime: 30000,
  });

  const filtered = useMemo(() => {
    if (!submissions) return [];
    if (!search) return submissions;
    const s = search.toLowerCase();
    return submissions.filter((sub) =>
      sub.from_address?.toLowerCase().includes(s) ||
      sub.subject?.toLowerCase().includes(s) ||
      sub.email_id?.toLowerCase().includes(s) ||
      sub.files?.some(f => f.filename.toLowerCase().includes(s))
    );
  }, [submissions, search]);

  const stats = useMemo(() => {
    if (!submissions) return { total: 0, withAttachments: 0, today: 0, totalSize: 0 };
    const todayStr = new Date().toISOString().slice(0, 10);
    return {
      total: submissions.length,
      withAttachments: submissions.filter(s => s.attachment_count > 0).length,
      today: submissions.filter(s => s.received_at?.startsWith(todayStr)).length,
      totalSize: submissions.reduce((acc, s) => acc + (s.raw_size_bytes || 0), 0),
    };
  }, [submissions]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <PanelGroup direction="horizontal" className="h-full bg-background">
      <Panel
        ref={sidebarRef}
        defaultSize={18}
        minSize={12}
        maxSize={40}
        collapsible
        collapsedSize={0}
        onCollapse={() => setSidebarCollapsed(true)}
        onExpand={() => setSidebarCollapsed(false)}
        className="overflow-hidden"
      >
        <StaticSidebar
          onLogout={() => logoutMutation.mutate()}
          onCollapse={() => sidebarRef.current?.collapse()}
        />
      </Panel>
      <PanelResizeHandle className="w-1.5 bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-col-resize" />

      <Panel className="overflow-hidden flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-card border-b border-border px-6 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {sidebarCollapsed && (
                <button
                  onClick={() => sidebarRef.current?.expand()}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Show sidebar"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              )}
              <div>
                <h1 className="text-xl font-bold text-foreground">New Business Submissions</h1>
                <p className="text-xs text-muted-foreground">Email submissions queue — underwriting-app.com</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { refetch(); toast({ title: "Refreshing", description: "Fetching latest submissions..." }); }} disabled={isFetching} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <ThemeToggle />
              <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>


        {/* Search */}
        <div className="px-6 py-2 flex-shrink-0 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
            <Input
              placeholder="Search by sender, subject, or filename..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} submission{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-2">
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Inbox className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No submissions found</p>
                <p className="text-xs mt-1">Send an email to any@underwriting-app.com</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-medium w-8"></th>
                    <th className="py-2.5 px-3 font-medium">ID</th>
                    <th className="py-2.5 px-3 font-medium w-36">Received</th>
                    <th className="py-2.5 px-3 font-medium w-48">From</th>
                    <th className="py-2.5 px-3 font-medium">Subject</th>
                    <th className="py-2.5 px-3 font-medium w-28 text-center">Attachments</th>
                    <th className="py-2.5 px-3 font-medium w-20">Size</th>
                    <th className="py-2.5 px-3 font-medium w-44 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((sub, idx) => {
                    const isExpanded = expandedRow === sub.email_id;
                    const attachments = (sub.files || []).filter(f => f.type === "attachment");
                    return (
                      <React.Fragment key={sub.email_id}>
                        <tr
                          onClick={() => setExpandedRow(isExpanded ? null : sub.email_id)}
                          className={`border-b border-border/40 hover:bg-primary/5 transition-colors cursor-pointer group ${idx % 2 === 0 ? "" : "bg-muted/20"} ${isExpanded ? "bg-primary/5" : ""}`}
                        >
                          <td className="py-2.5 px-4">
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[10px] text-primary">
                              {sub.email_id}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="text-xs font-medium">{formatDate(sub.received_at)}</div>
                            <div className="text-[10px] text-muted-foreground">{formatTime(sub.received_at)}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3 w-3 text-muted-foreground opacity-50" />
                              <span className="truncate max-w-[180px] text-xs" title={sub.from_address}>{sub.from_address}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 truncate max-w-[300px]" title={sub.subject}>
                            {sub.subject || "(no subject)"}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {sub.attachment_count > 0 ? (
                              <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                                <Paperclip className="h-2.5 w-2.5 mr-0.5" />
                                {sub.attachment_count}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-muted-foreground">
                            {formatBytes(sub.raw_size_bytes || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              className="h-7 text-[11px] bg-orange-500 hover:bg-orange-600 text-white px-3"
                              onClick={() => setLocation(`/agent-testing?submission=${sub.email_id}&workflow=submissions`)}
                            >
                              <Bot className="h-3 w-3 mr-1.5" />
                              Analyze with AI Agent
                            </Button>
                          </td>
                        </tr>

                        {/* Expanded detail row with document viewer */}
                        {isExpanded && (
                          <tr key={`${sub.email_id}-detail`} className="bg-muted/30">
                            <td colSpan={8} className="px-6 py-3">
                              <DocumentViewer emailId={sub.email_id} submission={sub} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-2 border-t flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {filtered.length} submissions
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </PanelGroup>
  );
}
