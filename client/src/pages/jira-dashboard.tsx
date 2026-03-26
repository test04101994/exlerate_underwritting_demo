import { useState, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { 
  Shield, 
  FileText, 
  Calculator, 
  Eye, 
  Mail, 
  Send, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Building,
  User,
  Calendar,
  LogOut,
  Search,
  Plus,
  Settings,
  MessageSquare,
  GitMerge,
  Archive,
  X,
  FileCheck,
  Activity,
  ExternalLink,
  Filter,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StaticSidebar } from "@/components/shared/StaticSidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";

// Jira Task Interface
interface JiraTask {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: {
    name: string;
    category: string;
  };
  priority: {
    name: string;
    iconUrl?: string;
  };
  assignee?: {
    displayName: string;
    emailAddress: string;
  };
  reporter: {
    displayName: string;
    emailAddress: string;
  };
  created: string;
  updated: string;
  dueDate?: string;
  project: {
    key: string;
    name: string;
  };
  issueType: {
    name: string;
    iconUrl?: string;
  };
  parent?: {
    key: string;
    summary: string;
  };
  url: string;
}

function getStatusBadgeColor(status: string) {
  switch (status.toLowerCase()) {
    case 'to do':
    case 'backlog':
      return 'bg-slate-100 text-slate-800';
    case 'in progress':
    case 'in review':
      return 'bg-blue-100 text-blue-800';
    case 'done':
    case 'closed':
    case 'resolved':
      return 'bg-green-100 text-green-800';
    case 'blocked':
    case 'cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

function getPriorityBadgeColor(priority: string) {
  switch (priority.toLowerCase()) {
    case 'highest':
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
    case 'lowest':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-slate-100 text-slate-800';
  }
}



export default function JiraDashboard() {
  const [currentLocation, setLocation] = useLocation();
  console.log('🌍 JiraDashboard current location:', currentLocation);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const tasksPerPage = 20;
  const { toast } = useToast();

  // State for tracking which task is being processed
  const [processingTask, setProcessingTask] = useState<string | null>(null);

  // Create workflow mutation
  const createWorkflowMutation = useMutation({
    mutationFn: async (data: { title: string; workflowType: string; forceNew?: boolean; ticketKey?: string }) => {
      const response = await apiRequest("POST", "/api/workflows", data);
      return response.json();
    },
    onMutate: (variables) => {
      setProcessingTask(variables.ticketKey || null);
    },
    onSuccess: (data, variables) => {
      console.log('=== WORKFLOW CREATION SUCCESS ===');
      console.log('Response data:', JSON.stringify(data, null, 2));
      console.log('Original variables:', JSON.stringify(variables, null, 2));
      
      // Navigate directly to the active workflow
      // Use the ticketKey from the original request as fallback
      const ticketKey = data?.session?.caseId || variables?.ticketKey;
      console.log('Extracted ticketKey:', ticketKey);
      console.log('Extracted sessionId:', data?.sessionId);
      console.log('Navigation URL:', `/jira-workflow/${ticketKey}?sessionId=${data?.sessionId}`);
      
      if (!ticketKey || !data?.sessionId) {
        console.error('Missing navigation data:', { 
          ticketKey, 
          sessionId: data?.sessionId,
          fullData: data,
          variables: variables
        });
        toast({
          title: "Navigation Error",
          description: `Could not navigate to workflow - missing required data. TicketKey: ${ticketKey}, SessionId: ${data?.sessionId}`,
          variant: "destructive"
        });
        setProcessingTask(null);
        return;
      }
      
      // Use the same navigation pattern as slip/submission workflows
      console.log('🚀 Navigating to workflow using sessionId:', data.sessionId);
      setLocation(`/workflow/${data.sessionId}`);
      
      toast({
        title: "Workflow Started",
        description: "Jira workflow has been created and is now running"
      });
      setProcessingTask(null);
      
      // Double-check navigation after a longer delay
      setTimeout(() => {
        console.log('🔍 DOUBLE-CHECK: Current location after navigation attempt:', window.location.pathname + window.location.search);
      }, 500);
    },
    onError: (error: any, variables) => {
      console.error('=== WORKFLOW CREATION ERROR ===');
      console.error('Full error object:', error);
      console.error('Error message:', error?.message);
      console.error('Error response:', error?.response);
      console.error('Error response data:', error?.response?.data);
      console.error('Error stack:', error?.stack);
      
      toast({
        title: "Error",
        description: `Failed to start workflow: ${error?.message || error?.toString() || 'Unknown error'}`,
        variant: "destructive"
      });
      setProcessingTask(null);
    }
  });

  // Fetch Jira tasks with auto-refresh
  const { data: jiraTasks, isLoading: tasksLoading, error: tasksError } = useQuery<JiraTask[]>({
    queryKey: ['/api/jira/tasks'],
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true,
    staleTime: 0
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation('/login');
    }
  });

  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    if (!jiraTasks) return [];
    
    return jiraTasks.filter(task => {
      const matchesSearch = task.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          task.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          task.assignee?.displayName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || task.status.name.toLowerCase() === statusFilter.toLowerCase();
      const matchesPriority = priorityFilter === 'all' || task.priority.name.toLowerCase() === priorityFilter.toLowerCase();
      
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [jiraTasks, searchTerm, statusFilter, priorityFilter]);

  // Statistics
  const statistics = useMemo(() => {
    if (!jiraTasks) return { total: 0, completed: 0, inProgress: 0, pending: 0, highPriority: 0 };
    
    return {
      total: jiraTasks.length,
      completed: jiraTasks.filter(t => ['done', 'closed', 'resolved'].includes(t.status.name.toLowerCase())).length,
      inProgress: jiraTasks.filter(t => ['in progress'].includes(t.status.name.toLowerCase())).length,
      pending: jiraTasks.filter(t => ['to do', 'backlog'].includes(t.status.name.toLowerCase())).length,
      highPriority: jiraTasks.filter(t => ['highest', 'high'].includes(t.priority.name.toLowerCase())).length
    };
  }, [jiraTasks]);

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleOpenTask = (task: JiraTask) => {
    // Open Jira task in new tab
    window.open(task.url, '_blank');
  };

  if (tasksError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
              <div>
                <h3 className="text-lg font-medium">Failed to load Jira tasks</h3>
                <p className="text-muted-foreground mt-2">Please check your Jira configuration</p>
              </div>
              <Button onClick={() => setLocation('/jira')}>
                Configure Jira
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="h-full bg-background">
      <Panel defaultSize={18} minSize={12} maxSize={40} className="overflow-hidden">
        <StaticSidebar onLogout={handleLogout} />
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-col-resize" />

      {/* Main Content */}
      <Panel className="overflow-hidden flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-card border-b border-border px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
              <p className="text-muted-foreground mt-1">
                Underwriting Platform
                <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                  Auto-refreshing every 30s
                </span>
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation('/jira-config')}
                className="flex items-center space-x-2"
              >
                <Settings className="h-4 w-4" />
                <span>Configure Jira</span>
              </Button>
              <div className="text-sm text-muted-foreground">
                Today: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="px-6 pt-6 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cases</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statistics.total}</div>
                <p className="text-xs text-muted-foreground">
                  XSX-4113 subtasks
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Completed</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{statistics.completed}</div>
                <p className="text-xs text-muted-foreground">
                  Successfully closed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">In Progress</CardTitle>
                <Clock className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{statistics.inProgress}</div>
                <p className="text-xs text-muted-foreground">
                  Currently active
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <Clock className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{statistics.pending}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting start
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{statistics.highPriority}</div>
                <p className="text-xs text-muted-foreground">
                  Urgent attention
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search cases..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="to do">To Do</SelectItem>
                <SelectItem value="in progress">In Progress</SelectItem>
                <SelectItem value="in review">In Review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="highest">Highest</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Scrollable Task List */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
          {/* Task List */}
          <div className="space-y-4">
            {tasksLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="pt-6">
                      <div className="animate-pulse space-y-3">
                        <div className="h-4 bg-muted rounded w-1/3"></div>
                        <div className="h-3 bg-muted rounded w-1/2"></div>
                        <div className="h-3 bg-muted rounded w-1/4"></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredTasks.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-2">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">No tasks found</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredTasks.slice((currentPage - 1) * tasksPerPage, currentPage * tasksPerPage).map((task) => (
                <Card key={task.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-foreground">{task.key}</h3>
                              <Badge className={getStatusBadgeColor(task.status.name)}>{task.status.name}</Badge>
                              <Badge className={getPriorityBadgeColor(task.priority.name)}>{task.priority.name}</Badge>
                            </div>
                            <p className="text-muted-foreground text-sm">{task.summary}</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button onClick={() => handleOpenTask(task)} variant="outline" size="sm">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Task
                            </Button>
                            <Button
                              onClick={() => createWorkflowMutation.mutate({ title: task.summary, workflowType: 'jira', forceNew: true, ticketKey: task.key })}
                              disabled={processingTask === task.key}
                              variant="outline"
                              size="sm"
                              className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 disabled:opacity-50"
                            >
                              {processingTask === task.key ? "Starting..." : "Start Workflow"}
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span className="font-medium">Assignee:</span>
                            <span>{task.assignee?.displayName || 'Unassigned'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <span className="font-medium">Reporter:</span>
                            <span>{task.reporter.displayName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span className="font-medium">Created:</span>
                            <span>{new Date(task.created).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span className="font-medium">Updated:</span>
                            <span>{new Date(task.updated).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {Math.ceil(filteredTasks.length / tasksPerPage) > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * tasksPerPage) + 1}–{Math.min(currentPage * tasksPerPage, filteredTasks.length)} of {filteredTasks.length} tasks
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {currentPage} of {Math.ceil(filteredTasks.length / tasksPerPage)}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(Math.ceil(filteredTasks.length / tasksPerPage), p + 1))} disabled={currentPage === Math.ceil(filteredTasks.length / tasksPerPage)}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </PanelGroup>
  );
}