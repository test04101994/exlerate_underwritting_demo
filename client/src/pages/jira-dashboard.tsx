import { useState, useMemo, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import {
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  LogOut,
  Search,
  Settings,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  User,
  Bot,
  PanelLeftOpen,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StaticSidebar } from "@/components/shared/StaticSidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface JiraTask {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: { name: string; category: string };
  priority: { name: string; iconUrl?: string };
  assignee?: { displayName: string; emailAddress: string };
  reporter: { displayName: string; emailAddress: string };
  created: string;
  updated: string;
  dueDate?: string;
  project: { key: string; name: string };
  issueType: { name: string; iconUrl?: string };
  parent?: { key: string; summary: string };
  url: string;
}

function statusColor(s: string) {
  const l = s.toLowerCase();
  if (["done", "closed", "resolved"].includes(l)) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (["in progress", "in review"].includes(l)) return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  if (["blocked", "cancelled"].includes(l)) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

function priorityColor(p: string) {
  const l = p.toLowerCase();
  if (["highest", "critical"].includes(l)) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  if (l === "high") return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
  if (l === "medium") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
}

export default function JiraDashboard() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const perPage = 10;
  const { toast } = useToast();

  const { data: tasks, isLoading, refetch, isFetching } = useQuery<JiraTask[]>({
    queryKey: ["/api/jira/tasks"],
    staleTime: 60000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Logout failed");
      return r.json();
    },
    onSuccess: () => { queryClient.clear(); setLocation("/login"); },
  });

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => {
      const s = search.toLowerCase();
      const matchSearch = !s || t.summary.toLowerCase().includes(s) || t.key.toLowerCase().includes(s) || t.assignee?.displayName.toLowerCase().includes(s);
      const matchStatus = statusFilter === "all" || t.status.name.toLowerCase() === statusFilter;
      const matchPriority = priorityFilter === "all" || t.priority.name.toLowerCase() === priorityFilter;
      return matchSearch && matchStatus && matchPriority;
    });
  }, [tasks, search, statusFilter, priorityFilter]);

  const stats = useMemo(() => {
    if (!tasks) return { total: 0, done: 0, progress: 0, pending: 0, high: 0 };
    return {
      total: tasks.length,
      done: tasks.filter((t) => ["done", "closed", "resolved"].includes(t.status.name.toLowerCase())).length,
      progress: tasks.filter((t) => t.status.name.toLowerCase() === "in progress").length,
      pending: tasks.filter((t) => ["to do", "backlog"].includes(t.status.name.toLowerCase())).length,
      high: tasks.filter((t) => ["highest", "high"].includes(t.priority.name.toLowerCase())).length,
    };
  }, [tasks]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  const handleRefresh = () => {
    refetch();
    toast({ title: "Refreshing", description: "Fetching latest cases from S3..." });
  };

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
                <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
                <p className="text-xs text-muted-foreground">Underwriting Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={() => setLocation("/jira-config")} className="gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                Configure
              </Button>
              <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="px-6 pt-4 pb-2 flex-shrink-0">
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Total", value: stats.total, icon: FileText, color: "text-foreground" },
              { label: "Completed", value: stats.done, icon: CheckCircle, color: "text-green-600" },
              { label: "In Progress", value: stats.progress, icon: Clock, color: "text-blue-600" },
              { label: "Pending", value: stats.pending, icon: Clock, color: "text-orange-600" },
              { label: "High Priority", value: stats.high, icon: AlertCircle, color: "text-red-600" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-2.5">
                <s.icon className={`h-4 w-4 ${s.color}`} />
                <div>
                  <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-2 flex-shrink-0 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
            <Input
              placeholder="Search by key, summary, or assignee..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="to do">To Do</SelectItem>
              <SelectItem value="in progress">In Progress</SelectItem>
              <SelectItem value="in review">In Review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="highest">Highest</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} case{filtered.length !== 1 ? "s" : ""}
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
                <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No cases found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-medium w-24">Key</th>
                    <th className="py-2.5 px-3 font-medium">Summary</th>
                    <th className="py-2.5 px-3 font-medium w-28">Status</th>
                    <th className="py-2.5 px-3 font-medium w-24">Priority</th>
                    <th className="py-2.5 px-3 font-medium w-32">Assignee</th>
                    <th className="py-2.5 px-3 font-medium w-24">Project</th>
                    <th className="py-2.5 px-3 font-medium w-24">Updated</th>
                    <th className="py-2.5 px-3 font-medium w-20 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((t, idx) => (
                    <tr
                      key={t.id}
                      className={`border-b border-border/40 hover:bg-primary/5 transition-colors group ${idx % 2 === 0 ? "" : "bg-muted/20"}`}
                    >
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-semibold text-primary text-xs">{t.key}</span>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[400px]" title={t.summary}>
                        {t.summary}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={`text-[10px] px-1.5 py-0 ${statusColor(t.status.name)}`}>
                          {t.status.name}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={`text-[10px] px-1.5 py-0 ${priorityColor(t.priority.name)}`}>
                          {t.priority.name}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 opacity-40" />
                          <span className="truncate max-w-[100px]">{t.assignee?.displayName || "Unassigned"}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{t.project.key}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-muted-foreground">
                        {new Date(t.updated).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-primary/10"
                            title={`Open ${t.key} in Jira`}
                            onClick={() => window.open(`https://parasghai11.atlassian.net/jira/software/projects/${t.project.key}/list?selectedIssue=${t.key}`, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                            title={`Analyze ${t.key} with AI Agent`}
                            onClick={() => setLocation(`/agent-testing?ticket=${t.key}`)}
                          >
                            <Bot className="h-3.5 w-3.5 text-blue-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Table footer with pagination inline */}
            {!isLoading && filtered.length > 0 && (
              <div className="bg-muted/30 border-t border-border px-4 py-2 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length} cases
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                      <Button key={p} variant={p === page ? "default" : "ghost"} size="sm" className="h-6 w-6 p-0 text-[11px]" onClick={() => setPage(p)}>
                        {p}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </Panel>
    </PanelGroup>
  );
}
