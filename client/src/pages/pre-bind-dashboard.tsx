import { useState, useMemo } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import {
  FileText,
  CheckCircle,
  Building,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Trash2,
  Inbox,
  ShieldCheck,
  TrendingUp,
  Calculator,
  GitCompare,
  ClipboardList,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { StaticSidebar } from "@/components/shared/StaticSidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NewCaseModal } from "@/components/new-case-modal";

interface PreBindCase {
  id: string;
  caseType: 'pre_bind';
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
  description: string;
  emailSubject: string;
  createdAt: string;
  updatedAt: string;
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-800 border-red-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const preBindStages = ['Submission Intake', 'Risk Prioritization', 'Sanctions Check', 'Submission Summary', 'Premium Generation', 'Policy Comparison', 'Bound'];

const getPreBindStage = (status: string, agentProgress: number) => {
  if (status === 'completed') return 'Bound';
  if (status === 'rejected') return 'Declined';
  if (status === 'pending_approval') return agentProgress >= 5 ? 'Quote Review' : 'Submission Review';
  if (status === 'processing') {
    if (agentProgress <= 1) return 'Submission Intake';
    if (agentProgress <= 2) return 'Risk Prioritization';
    if (agentProgress <= 3) return 'Sanctions Check';
    if (agentProgress <= 4) return 'Submission Summary';
    if (agentProgress <= 5) return 'Premium Generation';
    return 'Policy Comparison';
  }
  return 'Submission Intake';
};

const getStageColor = (stage: string) => {
  switch (stage) {
    case 'Submission Intake': return 'bg-blue-100 text-blue-800';
    case 'Submission Review': return 'bg-indigo-100 text-indigo-800';
    case 'Risk Prioritization': return 'bg-cyan-100 text-cyan-800';
    case 'Sanctions Check': return 'bg-amber-100 text-amber-800';
    case 'Submission Summary': return 'bg-purple-100 text-purple-800';
    case 'Premium Generation': return 'bg-teal-100 text-teal-800';
    case 'Policy Comparison': return 'bg-pink-100 text-pink-800';
    case 'Quote Review': return 'bg-pink-100 text-pink-800';
    case 'Bound': return 'bg-green-100 text-green-800';
    case 'Declined': return 'bg-red-100 text-red-800';
    default: return 'bg-muted text-muted-foreground';
  }
};

export default function PreBindDashboard() {
  const [, setLocation] = useLocation();
  const [currentPage, setCurrentPage] = useState(1);
  const casesPerPage = 20;

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');

  const { data: dashboardCases = [], isLoading: casesLoading } = useQuery({
    queryKey: ['/api/dashboard/cases'],
    refetchInterval: 30000,
  });

  const preBindCases: PreBindCase[] = useMemo(() => {
    if (!dashboardCases || !Array.isArray(dashboardCases) || dashboardCases.length === 0) return [];

    return dashboardCases
      .filter((dc: any) => dc.case_type === 'pre_bind')
      .slice()
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((dc: any) => ({
        id: dc.case_id,
        caseType: 'pre_bind' as const,
        businessName: dc.business_name,
        policyType: dc.policy_type,
        submissionDate: dc.submission_date,
        currentAgent: dc.current_agent,
        agentProgress: dc.agent_progress,
        status: dc.status,
        priority: dc.priority,
        assignedUnderwriter: dc.assigned_underwriter,
        brokerEmail: dc.broker_email,
        targetPremium: dc.target_premium,
        description: dc.description,
        emailSubject: dc.email_subject,
        createdAt: dc.created_at,
        updatedAt: dc.updated_at,
      }));
  }, [dashboardCases]);

  const filteredCases = useMemo(() => {
    let filtered = preBindCases;

    if (searchTerm) {
      filtered = filtered.filter(c =>
        c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      if (dateRange === 'today') filterDate.setHours(0, 0, 0, 0);
      else if (dateRange === 'week') filterDate.setDate(now.getDate() - 7);
      else if (dateRange === 'month') filterDate.setMonth(now.getMonth() - 1);
      filtered = filtered.filter(c => new Date(c.createdAt) >= filterDate);
    }
    return filtered;
  }, [preBindCases, searchTerm, statusFilter, priorityFilter, dateRange]);

  const totalPages = Math.ceil(filteredCases.length / casesPerPage);
  const paginatedCases = filteredCases.slice(
    (currentPage - 1) * casesPerPage,
    currentPage * casesPerPage
  );

  const stats = useMemo(() => {
    const total = preBindCases.length;
    const intake = preBindCases.filter(c => ['Submission Intake', 'Submission Review'].includes(getPreBindStage(c.status, c.agentProgress))).length;
    const screening = preBindCases.filter(c => ['Risk Prioritization', 'Sanctions Check'].includes(getPreBindStage(c.status, c.agentProgress))).length;
    const pricing = preBindCases.filter(c => ['Submission Summary', 'Premium Generation', 'Policy Comparison', 'Quote Review'].includes(getPreBindStage(c.status, c.agentProgress))).length;
    const bound = preBindCases.filter(c => getPreBindStage(c.status, c.agentProgress) === 'Bound').length;
    return { total, intake, screening, pricing, bound };
  }, [preBindCases]);

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      setLocation("/login");
    },
  });

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [documentsModal, setDocumentsModal] = useState({ isOpen: false, caseId: '' });
  const [selectedDocuments, setSelectedDocuments] = useState<any[]>([]);
  const [newSubmissionOpen, setNewSubmissionOpen] = useState(false);

  const handleViewDocuments = async (caseId: string) => {
    try {
      const response = await fetch(`/api/documents/${caseId}`);
      if (response.ok) {
        const documents = await response.json();
        setSelectedDocuments(documents);
        setDocumentsModal({ isOpen: true, caseId });
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

  const handleOpenCase = async (caseId: string) => {
    try {
      const createResponse = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Pre-Bind Submission — ${caseId}`,
          caseType: 'pre_bind',
          caseId,
          forceNew: true
        }),
      });
      if (createResponse.ok) {
        const workflow = await createResponse.json();
        setLocation(`/workflow/${workflow.sessionId}`);
      }
    } catch (error) {
      console.error('Error opening submission:', error);
    }
  };

  const handleDeleteCase = async (caseId: string) => {
    try {
      const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/delete`, { method: 'POST' });
      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ['/api/dashboard/cases'] });
      }
    } catch (err) {
      console.error('Error deleting submission:', err);
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <PanelGroup direction="horizontal" className="h-full bg-background">
        <Panel defaultSize={18} minSize={12} maxSize={40} className="overflow-hidden">
          <StaticSidebar onLogout={() => logoutMutation.mutate()} />
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-border hover:bg-blue-500 active:bg-blue-600 transition-colors cursor-col-resize" />

        <Panel className="overflow-auto flex flex-col min-w-0">
          <div className="bg-card border-b border-border px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Pre-Bind Submissions</h1>
                <p className="text-muted-foreground mt-1">
                  New business intake and pre-bind underwriting
                  <span className="ml-2 inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                    Auto-refreshing every 30s
                  </span>
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <ThemeToggle />
                <Button
                  onClick={() => setNewSubmissionOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Submission
                </Button>
                <div className="text-sm text-muted-foreground">
                  Today: {new Date().toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 overflow-auto flex-1">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
                  <Inbox className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{preBindCases.length}</div>
                  <p className="text-xs text-muted-foreground">Open submissions in pipeline</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Intake</CardTitle>
                  <FileText className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{stats.intake}</div>
                  <p className="text-xs text-muted-foreground">Awaiting first review</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Screening</CardTitle>
                  <ShieldCheck className="h-4 w-4 text-cyan-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-cyan-600">{stats.screening}</div>
                  <p className="text-xs text-muted-foreground">Risk &amp; sanctions</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pricing</CardTitle>
                  <Calculator className="h-4 w-4 text-purple-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{stats.pricing}</div>
                  <p className="text-xs text-muted-foreground">Premium &amp; comparison</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Bound</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.bound}</div>
                  <p className="text-xs text-muted-foreground">On-risk</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search submissions by ID, insured, underwriter, broker..."
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
                <option value="rejected">Declined</option>
                <option value="completed">Bound</option>
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
                      <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
                      <p className="text-muted-foreground">No submissions yet — click <span className="font-medium">New Submission</span> to upload broker documents.</p>
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
                            <CardTitle className="text-lg">{caseItem.businessName}</CardTitle>
                          </div>
                          <div className="px-3 py-1 bg-blue-50 dark:bg-blue-950 rounded-full">
                            <span className="text-sm font-mono text-blue-700 dark:text-blue-300">{caseItem.id}</span>
                          </div>
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">PRE-BIND</Badge>
                          <Badge className={getPriorityColor(caseItem.priority)}>
                            {caseItem.priority.toUpperCase()}
                          </Badge>
                          <Badge className={getStageColor(getPreBindStage(caseItem.status, caseItem.agentProgress))}>
                            {getPreBindStage(caseItem.status, caseItem.agentProgress)}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleOpenCase(caseItem.id)}>
                            Start Workflow
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleViewDocuments(caseItem.id)}>
                            View Documents
                          </Button>
                          {deleteConfirm === caseItem.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">Delete?</span>
                              <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={() => handleDeleteCase(caseItem.id)}>Yes</Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDeleteConfirm(null)}>No</Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
                              onClick={() => setDeleteConfirm(caseItem.id)}
                              title="Delete submission"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <CardDescription className="flex items-center space-x-4 mt-2">
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>Received: {new Date(caseItem.createdAt).toLocaleDateString()}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>Updated: {new Date(caseItem.updatedAt).toLocaleDateString()}</span>
                        </span>
                        <span className="text-sm text-muted-foreground">{caseItem.policyType}</span>
                        {caseItem.targetPremium && (
                          <span className="text-sm font-semibold text-foreground">
                            Target Premium: {caseItem.targetPremium}
                          </span>
                        )}
                      </CardDescription>
                      <CardDescription className="mt-2 space-y-1">
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Underwriter:</span>
                          <span className="ml-1">{caseItem.assignedUnderwriter}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Broker:</span>
                          <span className="ml-1">{caseItem.brokerEmail || '—'}</span>
                        </div>
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>

            {filteredCases.length > casesPerPage && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * casesPerPage) + 1}–{Math.min(currentPage * casesPerPage, filteredCases.length)} of {filteredCases.length} submissions
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

          <NewCaseModal
            open={newSubmissionOpen}
            onClose={() => setNewSubmissionOpen(false)}
            lockedCaseType="pre_bind"
          />

          <Dialog open={documentsModal.isOpen} onOpenChange={(isOpen) => setDocumentsModal({ isOpen, caseId: documentsModal.caseId })}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Documents for Submission {documentsModal.caseId}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {selectedDocuments.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No documents found for this submission.</p>
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
                            <Badge variant="outline" className="text-xs">{doc.type.toUpperCase()}</Badge>
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
    </>
  );
}
