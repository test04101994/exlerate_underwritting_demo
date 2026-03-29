import { useState, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { 
  Shield, 
  FileText, 
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
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Settings,
  MessageSquare,
  GitMerge,
  Archive,
  X,
  FileCheck,
  Trash2
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { loadDashboardCases, type DashboardCase } from "@shared/dashboard-cases";
import { StaticSidebar } from "@/components/shared/StaticSidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NewCaseModal } from "@/components/new-case-modal";
// import exlLogo from "@assets/download (1)_1752064428322.png";

interface Case {
  id: string;
  sessionId: string;
  caseType: 'slip';
  businessName: string;
  policyType: string;
  submissionDate: string;
  currentAgent: string;
  agentProgress: number;
  status: 'pending_approval' | 'processing' | 'completed' | 'rejected';
  priority: 'high' | 'medium' | 'low';
  assignedUnderwriter: string;
  brokerEmail: string;
  targetPremium: string;
  coverageAmount: string;
  description: string;
  emailSubject: string;
  createdAt: string;
  updatedAt: string;
  agents: AgentStatus[];
}

interface AgentStatus {
  name: string;
  type: string;
  status: 'completed' | 'running' | 'pending' | 'waiting';
  progress: number;
  icon: React.ReactNode;
  description: string;
}

// Generate cases from dashboard CSV configuration
const generateCasesFromDashboardCSV = (): Case[] => {
  try {
    // This will be loaded from the server via API
    return [];
  } catch (error) {
    console.error('Error loading dashboard cases:', error);
    return [];
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending_approval': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'completed': return 'bg-green-100 text-green-800 border-green-200';
    case 'rejected': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const getAgentStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'text-green-600';
    case 'running': return 'text-blue-600';
    case 'pending': return 'text-gray-400';
    case 'waiting': return 'text-orange-600';
    default: return 'text-gray-400';
  }
};

// Business Process Stage Mapping Function - moved outside component to fix initialization
const getBusinessProcessStage = (status: string, agentProgress: number) => {
  // Map agent progress to insurance quote pipeline stages
  if (status === 'completed') {
    return 'Quote Issued';
  } else if (status === 'pending_approval') {
    return agentProgress >= 7 ? 'Quote Review' : 'Data Review';
  } else if (status === 'processing') {
    if (agentProgress <= 1) {
      return 'Data Extraction';
    } else if (agentProgress <= 3) {
      return 'Property Enrichment';
    } else if (agentProgress <= 5) {
      return 'Risk Assessment';
    } else {
      return 'Quote Generation';
    }
  } else {
    return 'Data Extraction';
  }
};

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const casesPerPage = 20;
  
  // Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  
  // Load dashboard cases from API
  const { data: dashboardCases = [], isLoading: casesLoading } = useQuery({
    queryKey: ['/api/dashboard/cases'],
    refetchInterval: 30000, // Refresh every 30 seconds to pick up CSV changes
  });
  
  // Convert dashboard cases to Case format with agent configurations
  const mockCases: Case[] = useMemo(() => {
    if (!dashboardCases || !Array.isArray(dashboardCases) || dashboardCases.length === 0) return [];
    
    return dashboardCases.map((dashboardCase: any) => {
      const agentConfigs = [
        { name: "Data Extraction", type: "data_extraction", icon: <FileText className="h-4 w-4" />, description: "Extracts key data from Lloyd's slip documents" },
        { name: "Data Transformation", type: "transformation", icon: <Eye className="h-4 w-4" />, description: "Standardizes extracted data for downstream processing" },
        { name: "Quality Assurance", type: "qa", icon: <Shield className="h-4 w-4" />, description: "Validates accuracy and completeness against PAS" },
        { name: "Sanctions Check", type: "sanctions", icon: <CheckCircle className="h-4 w-4" />, description: "Screens against OFAC/UN/EU sanctions lists" },
        { name: "PAS Integration", type: "integration", icon: <FileCheck className="h-4 w-4" />, description: "Updates Policy Administration System with validated data" }
      ];
      
      // Calculate business process stage statuses based on progress
      const agents = agentConfigs.map((config, index) => {
        // Use the same business process stage logic as the badge
        const currentStage = getBusinessProcessStage(dashboardCase.status, dashboardCase.agent_progress);
        const slipStages = ['Data Extraction', 'Data Transformation', 'Quality Assurance', 'Sanctions Check', 'PAS Integration'];
        const stageNames = slipStages;
        const stageIndex = stageNames.indexOf(currentStage);
        
        const isCompleted = index < stageIndex;
        const isRunning = index === stageIndex;
        const progress = isCompleted ? 100 : isRunning ? 75 : 0;
        const status = isCompleted ? 'completed' : isRunning ? 'running' : 'pending';
        
        return {
          name: config.name,
          type: config.type,
          status: status as 'completed' | 'running' | 'pending' | 'waiting',
          progress,
          icon: config.icon,
          description: config.description
        };
      });
      
      return {
        id: dashboardCase.case_id,
        sessionId: `${dashboardCase.case_type.toUpperCase().slice(0,3)}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        caseType: dashboardCase.case_type,
        businessName: dashboardCase.business_name,
        policyType: dashboardCase.policy_type,
        submissionDate: dashboardCase.submission_date,
        currentAgent: dashboardCase.current_agent,
        agentProgress: dashboardCase.agent_progress,
        status: dashboardCase.status,
        priority: dashboardCase.priority,
        assignedUnderwriter: dashboardCase.assigned_underwriter,
        brokerEmail: dashboardCase.broker_email,
        targetPremium: dashboardCase.target_premium,
        coverageAmount: dashboardCase.coverage_amount,
        description: dashboardCase.description,
        emailSubject: dashboardCase.email_subject,
        createdAt: dashboardCase.created_at,
        updatedAt: dashboardCase.updated_at,
        agents
      };
    });
  }, [dashboardCases]);

  // Filter cases
  const filteredCases = useMemo(() => {
    let filtered = mockCases;

    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.assignedUnderwriter.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.brokerEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.emailSubject.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (statusFilter !== 'all') filtered = filtered.filter(c => c.status === statusFilter);
    if (priorityFilter !== 'all') filtered = filtered.filter(c => c.priority === priorityFilter);
    if (dateRange !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      if (dateRange === 'today') { filterDate.setHours(0, 0, 0, 0); }
      else if (dateRange === 'week') { filterDate.setDate(now.getDate() - 7); }
      else if (dateRange === 'month') { filterDate.setMonth(now.getMonth() - 1); }
      filtered = filtered.filter(c => new Date(c.createdAt) >= filterDate);
    }
    return filtered;
  }, [mockCases, searchTerm, statusFilter, priorityFilter, dateRange]);
  
  // Calculate pagination
  const totalPages = Math.ceil(filteredCases.length / casesPerPage);
  const paginatedCases = filteredCases.slice(
    (currentPage - 1) * casesPerPage,
    currentPage * casesPerPage
  );
  
  // Calculate statistics by insurance quote pipeline stages
  const stats = useMemo(() => {
    const total = mockCases.length;
    const intake = mockCases.filter(c => ['Data Extraction', 'Data Review'].includes(getBusinessProcessStage(c.status, c.agentProgress))).length;
    const analysis = mockCases.filter(c => ['Property Enrichment', 'Risk Assessment'].includes(getBusinessProcessStage(c.status, c.agentProgress))).length;
    const decision = mockCases.filter(c => ['Quote Generation', 'Quote Review'].includes(getBusinessProcessStage(c.status, c.agentProgress))).length;
    const binding = mockCases.filter(c => getBusinessProcessStage(c.status, c.agentProgress) === 'Quote Issued').length;

    return { total, intake, analysis, decision, binding };
  }, [mockCases]);

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/login");
    },
  });

  const handleViewCase = (caseItem: Case) => {
    // Check for existing workflow first, create if none exists
    handleOpenCase(caseItem.id, caseItem.caseType);
  };

  const [newCaseModalOpen, setNewCaseModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null); // caseId pending confirmation
  const [documentsModal, setDocumentsModal] = useState({ isOpen: false, caseId: '' });
  const [selectedDocuments, setSelectedDocuments] = useState<any[]>([]);
  
  const handleViewDocuments = async (caseId: string) => {
    try {
      const response = await fetch(`/api/documents/${caseId}`);
      if (response.ok) {
        const documents = await response.json();
        setSelectedDocuments(documents);
        setDocumentsModal({ isOpen: true, caseId });
      } else {
        console.error('Failed to fetch documents');
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  const handleDocumentView = async (caseId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/documents/${caseId}/${fileName}`);
      if (response.ok) {
        const content = await response.text();
        // Open in new tab
        const newWindow = window.open('', '_blank');
        if (newWindow) {
          newWindow.document.write(content);
          newWindow.document.close();
        }
      }
    } catch (error) {
      console.error('Error viewing document:', error);
    }
  };

  const handleOpenCase = async (caseId: string, caseType: 'slip' = 'slip') => {
    try {
      const createResponse = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Slip Processing — ${caseId}`,
          caseType,
          caseId,
          forceNew: true
        }),
      });
      if (createResponse.ok) {
        const workflow = await createResponse.json();
        setLocation(`/workflow/${workflow.sessionId}`);
      } else {
        console.error('Failed to create workflow');
      }
    } catch (error) {
      console.error('Error opening case:', error);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/delete`, { method: 'POST' });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['/api/dashboard/cases'] });
      }
    } catch (err) {
      console.error('Error deleting case:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleCreateNewWorkflow = async (title?: string, caseType: 'slip' = 'slip', caseId?: string) => {
    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title || `New Slip Processing`,
          caseType,
          caseId: caseId || 'SLP-2025-001',
          forceNew: true // Force new workflow creation
        }),
      });
      
      if (response.ok) {
        const workflow = await response.json();
        setLocation(`/workflow/${workflow.sessionId}`);
      } else {
        console.error('Failed to create workflow');
      }
    } catch (error) {
      console.error('Error creating workflow:', error);
    }
  };

  const getOverallProgress = (agents: AgentStatus[]) => {
    const totalProgress = agents.reduce((sum, agent) => sum + agent.progress, 0);
    return Math.round(totalProgress / agents.length);
  };



  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'Data Extraction':
        return 'bg-blue-100 text-blue-800';
      case 'Data Review':
        return 'bg-indigo-100 text-indigo-800';
      case 'Property Enrichment':
        return 'bg-yellow-100 text-yellow-800';
      case 'Risk Assessment':
        return 'bg-orange-100 text-orange-800';
      case 'Quote Generation':
        return 'bg-purple-100 text-purple-800';
      case 'Quote Review':
        return 'bg-pink-100 text-pink-800';
      case 'Quote Issued':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <>
    <PanelGroup direction="horizontal" className="h-full bg-background">
      <Panel defaultSize={18} minSize={12} maxSize={40} className="overflow-hidden">
        <StaticSidebar onLogout={() => logoutMutation.mutate()} />
      </Panel>

      <PanelResizeHandle className="w-1.5 bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-col-resize" />

      {/* Main Content */}
      <Panel className="overflow-auto flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">New Business Submissions</h1>
              <p className="text-muted-foreground mt-1">
                Personal Lines — Property Insurance
                <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                  Auto-refreshing every 30s
                </span>
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              <Button onClick={() => setNewCaseModalOpen(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                New Case
              </Button>
              <div className="text-sm text-muted-foreground">
                Today: {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="px-6 py-6 overflow-auto flex-1">

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{mockCases.length}</div>
                <p className="text-xs text-muted-foreground">Personal lines new business</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Data Extraction</CardTitle>
                <FileText className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.intake}</div>
                <p className="text-xs text-muted-foreground">Policy data being extracted</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Risk Analysis</CardTitle>
                <Eye className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{stats.analysis}</div>
                <p className="text-xs text-muted-foreground">Geocoding & risk assessment</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Quote Ready</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{stats.decision}</div>
                <p className="text-xs text-muted-foreground">Awaiting underwriter review</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{mockCases.filter(c => c.priority === 'high').length}</div>
                <p className="text-xs text-muted-foreground">Requires urgent attention</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <input
                type="text"
                placeholder="Search submissions by ID, underwriter, broker..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-48 px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="processing">Processing</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="rejected">Pending Broker Info</option>
              <option value="completed">Completed</option>
            </select>
            <select
              value={priorityFilter}
              onChange={(e) => { setPriorityFilter(e.target.value); setCurrentPage(1); }}
              className="w-48 px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={dateRange}
              onChange={(e) => { setDateRange(e.target.value); setCurrentPage(1); }}
              className="w-48 px-3 py-2 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>

          {/* Case List */}
          <div className="space-y-4">
            {casesLoading ? (
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
            ) : filteredCases.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-2">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="text-muted-foreground">No cases found</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              paginatedCases.map((caseItem) => (
                <Card key={caseItem.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Building className="h-5 w-5 text-muted-foreground" />
                          <CardTitle className="text-lg">{caseItem.assignedUnderwriter}</CardTitle>
                        </div>
                        <div className="px-3 py-1 bg-blue-50 dark:bg-blue-950 rounded-full">
                          <span className="text-sm font-mono text-blue-700 dark:text-blue-300">{caseItem.id}</span>
                        </div>
                        <Badge className={caseItem.caseType === 'slip' ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-blue-100 text-blue-800 border-blue-200'}>
                          {caseItem.caseType === 'slip' ? 'LLOYD\'S SLIP' : 'PERSONAL LINES'}
                        </Badge>
                        <Badge className={getPriorityColor(caseItem.priority)}>
                          {caseItem.priority.toUpperCase()}
                        </Badge>
                        <Badge className={getStageColor(getBusinessProcessStage(caseItem.status, caseItem.agentProgress))}>
                          {getBusinessProcessStage(caseItem.status, caseItem.agentProgress)}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" onClick={() => handleViewCase(caseItem)}>
                          {caseItem.caseType === 'jira' ? 'View Details' : 'Start Workflow'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleViewDocuments(caseItem.id)}>
                          View Documents
                        </Button>
                        {deleteConfirm === caseItem.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Delete?</span>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleDeleteCase(caseItem.id)}
                            >
                              Yes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => setDeleteConfirm(caseItem.id)}
                            title="Delete case"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <CardDescription className="flex items-center space-x-4 mt-2">
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Created: {new Date(caseItem.createdAt).toLocaleDateString()}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Modified: {new Date(caseItem.updatedAt).toLocaleDateString()}</span>
                      </span>
                      <span className="text-sm text-muted-foreground">{caseItem.policyType}</span>
                    </CardDescription>
                    <CardDescription className="mt-2 space-y-1">
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Broker Email:</span>
                        <span className="text-blue-600 dark:text-blue-400 ml-1">{caseItem.brokerEmail}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Email Subject:</span>
                        <span className="text-blue-600 dark:text-blue-400 ml-1">{caseItem.emailSubject}</span>
                      </div>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Pagination Controls */}
          {filteredCases.length > casesPerPage && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * casesPerPage) + 1}–{Math.min(currentPage * casesPerPage, filteredCases.length)} of {filteredCases.length} cases
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Documents Modal */}
      <Dialog open={documentsModal.isOpen} onOpenChange={(isOpen) => setDocumentsModal({ isOpen, caseId: documentsModal.caseId })}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Documents for Case {documentsModal.caseId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDocuments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No documents found for this case.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {selectedDocuments.map((doc) => (
                  <Card key={doc.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <CardTitle className="text-sm font-medium">{doc.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Badge variant="outline" className="text-xs">
                          {doc.type.toUpperCase()}
                        </Badge>
                        <p className="text-xs text-gray-500">
                          Size: {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : 'N/A'}
                        </p>
                        <p className="text-xs text-gray-500">
                          Modified: {doc.lastModified ? new Date(doc.lastModified).toLocaleDateString() : 'N/A'}
                        </p>
                        <Button
                          onClick={() => handleDocumentView(documentsModal.caseId, doc.name)}
                          className="w-full mt-2"
                          size="sm"
                        >
                          Open Document
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </Panel>
    </PanelGroup>

    <NewCaseModal open={newCaseModalOpen} onClose={() => setNewCaseModalOpen(false)} />
    </>
  );
}