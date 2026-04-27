import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExternalLink, Settings, Loader2, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface JiraTask {
  id: string;
  key: string;
  summary: string;
  description?: string;
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
  url: string;
}

interface JiraConfig {
  baseUrl: string;
  username: string;
  apiToken: string;
  projectKey: string;
}

const JiraIntegration = () => {
  const [config, setConfig] = useState<JiraConfig>({
    baseUrl: 'https://digitalfx.atlassian.net',
    username: 'paras.ghai@exlservice.com',
    apiToken: 'ATATT3xFfGF03n-cYP9dKNXucL0TK88A1kzxKBxrnwu-VZLwGEJCj_ViQwNYtB8ctzYhNYM6gIj0tXzFBCQWS7lTMfsT1FMmvQSY0o_IGD_VI2t6IrygDSEC-sTCbVH2bRzQRIjrfDZ_W_Gn7S36Jr0sSzLiVj1KiBwRhHM9ocDlIRAXlciLUHY=06B9FBA0',
    projectKey: 'HIS-86-SUBTASKS'
  });
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch Jira configuration
  const { data: jiraConfig, isLoading: configLoading } = useQuery({
    queryKey: ['/api/jira/config'],
    enabled: true
  });

  // Fetch Jira tasks with auto-refresh every 2 seconds
  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useQuery<JiraTask[]>({
    queryKey: ['/api/jira/tasks'],
    enabled: !!jiraConfig?.baseUrl && !!jiraConfig?.username,
    refetchInterval: 2000, // Auto-refresh every 2 seconds
    refetchOnWindowFocus: true,
    staleTime: 0 // Always consider data stale to enable frequent updates
  });

  // Save configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: (newConfig: JiraConfig) => apiRequest('PUT', '/api/jira/config', newConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jira/config'] });
      queryClient.invalidateQueries({ queryKey: ['/api/jira/tasks'] });
      setIsConfigOpen(false);
    }
  });

  // Test connection mutation  
  const testConnectionMutation = useMutation({
    mutationFn: () => {
      console.log('Testing connection with config:', config);
      return apiRequest('POST', '/api/jira/test-connection', config);
    },
    onSuccess: (data) => {
      console.log('Test connection successful:', data);
    },
    onError: (error) => {
      console.error('Test connection failed:', error);
    }
  });

  // Sync tasks mutation
  const syncTasksMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/jira/sync'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jira/tasks'] });
    }
  });

  // Mismatch Summary Agent mutation with real OpenRouter AI
  const mismatchSummaryMutation = useMutation({
    mutationFn: (ticketKey: string) => apiRequest('POST', '/api/mismatch-summary', {
      ticketKey,
      context: {
        source: 'jira_integration',
        processing_type: 'mismatch_analysis'
      }
    }),
    onSuccess: (data, ticketKey) => {
      console.log(`[Mismatch Summary] Successfully processed ${ticketKey}:`, data);
      if (data.jiraUpdated) {
        console.log(`[Jira Update] Ticket ${ticketKey} updated with AI-generated summary`);
      }
    },
    onError: (error) => {
      console.error('[Mismatch Summary] Error:', error);
    }
  });

  useEffect(() => {
    if (jiraConfig) {
      setConfig(jiraConfig);
    }
  }, [jiraConfig]);

  const handleSaveConfig = () => {
    saveConfigMutation.mutate(config);
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const handleSyncTasks = () => {
    syncTasksMutation.mutate();
  };

  const handleMismatchSummary = (ticketKey: string) => {
    console.log(`[Mismatch Summary] Triggering mismatch summary for ticket: ${ticketKey}`);
    mismatchSummaryMutation.mutate(ticketKey);
  };

  const getStatusBadgeColor = (status: string, category: string) => {
    switch (category.toLowerCase()) {
      case 'new':
      case 'to do':
        return 'bg-blue-100 text-blue-800';
      case 'indeterminate':
      case 'in progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'done':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityBadgeColor = (priority: string) => {
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
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getFilteredTasks = (filterType: string) => {
    if (!tasks) return [];
    
    switch (filterType) {
      case 'my-tasks':
        return tasks.filter(task => 
          task.assignee?.emailAddress === jiraConfig?.username
        );
      case 'in-progress':
        return tasks.filter(task => 
          task.status.category.toLowerCase() === 'indeterminate' ||
          task.status.category.toLowerCase() === 'in progress'
        );
      case 'high-priority':
        return tasks.filter(task => 
          task.priority.name.toLowerCase() === 'high' ||
          task.priority.name.toLowerCase() === 'highest' ||
          task.priority.name.toLowerCase() === 'critical'
        );
      case 'due-soon':
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        return tasks.filter(task => 
          task.dueDate && new Date(task.dueDate) <= nextWeek
        );
      default:
        return tasks;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <img 
                  src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/jira/jira-original.svg" 
                  alt="Jira" 
                  className="w-8 h-8"
                />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">EXLerate AI</h1>
                  <p className="text-sm text-gray-500">Agentic Platform</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button 
                onClick={handleSyncTasks}
                disabled={syncTasksMutation.isPending || !jiraConfig?.baseUrl}
                variant="outline"
              >
                {syncTasksMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Sync Tasks
              </Button>
              
              <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Jira Configuration</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="baseUrl">Jira Base URL</Label>
                      <Input
                        id="baseUrl"
                        placeholder="https://digitalfx.atlassian.net"
                        value={config.baseUrl}
                        onChange={(e) => setConfig({...config, baseUrl: e.target.value})}
                        readOnly
                        className="bg-gray-50"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="username">Username/Email</Label>
                      <Input
                        id="username"
                        placeholder="your.email@digitalfx.com"
                        value={config.username}
                        onChange={(e) => setConfig({...config, username: e.target.value})}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="apiToken">API Token</Label>
                      <Input
                        id="apiToken"
                        type="password"
                        placeholder="API token is pre-configured"
                        value={config.apiToken}
                        onChange={(e) => setConfig({...config, apiToken: e.target.value})}
                        readOnly
                        className="bg-gray-50"
                      />
                      <div className="text-xs text-gray-500">
                        API token provided by user is pre-configured
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="projectKey">Project Key (Optional)</Label>
                      <Input
                        id="projectKey"
                        placeholder="Leave empty to see all projects, or use HIS"
                        value={config.projectKey}
                        onChange={(e) => setConfig({...config, projectKey: e.target.value})}
                      />
                      <div className="text-xs text-gray-500">
                        Currently configured to show only subtasks under HIS-86. Use "HIS" to see all HIS project tasks.
                      </div>
                    </div>
                    
                    <div className="flex space-x-2 pt-4">
                      <Button 
                        onClick={handleTestConnection}
                        disabled={testConnectionMutation.isPending}
                        variant="outline"
                        className="flex-1"
                      >
                        {testConnectionMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Test Connection
                      </Button>
                      
                      <Button 
                        onClick={handleSaveConfig}
                        disabled={saveConfigMutation.isPending}
                        className="flex-1"
                      >
                        {saveConfigMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Save Configuration
                      </Button>
                    </div>
                    
                    {testConnectionMutation.data && (
                      <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription>
                          Connection test successful! Jira integration is working.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {testConnectionMutation.error && (
                      <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>
                          Connection failed. Please check your credentials.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {!jiraConfig?.username || jiraConfig?.username === '' ? (
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p>API token is configured. Please enter your <strong>digitalfx.atlassian.net</strong> email address in Settings to complete the connection:</p>
                  <ol className="list-decimal list-inside text-sm space-y-1 ml-4">
                    <li>Click Settings button above</li>
                    <li>Enter your digitalfx.com email address</li>
                    <li>Click "Save Configuration"</li>
                    <li>API token is already provided</li>
                  </ol>
                </div>
              </AlertDescription>
            </Alert>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ready to Connect: digitalfx.atlassian.net</CardTitle>
                <CardDescription>
                  API token configured for all projects (HIS and others) - just need your email address
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600">
                  <p>Once your email is configured, you'll be able to view:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>All accessible projects and tasks (HIS-86, etc.)</li>
                    <li>Tasks assigned to you across all projects</li>
                    <li>In-progress tasks from all projects</li>
                    <li>High priority tasks</li>
                    <li>Tasks due soon</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : tasksError ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p><strong>Connection Error:</strong> {tasksError.message}</p>
                  {tasksError.message.includes('does not exist for the field') ? (
                    <p className="text-sm">Project key issue: Use "HIS" (not HIS-88) or leave empty to see all projects.</p>
                  ) : (
                    <p className="text-sm">Please check your configuration in Settings.</p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <Tabs defaultValue="all-tasks" className="space-y-6">
            <TabsList>
              <TabsTrigger value="all-tasks">All Tasks</TabsTrigger>
              <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
              <TabsTrigger value="in-progress">In Progress</TabsTrigger>
              <TabsTrigger value="high-priority">High Priority</TabsTrigger>
              <TabsTrigger value="due-soon">Due Soon</TabsTrigger>
            </TabsList>

            {['all-tasks', 'my-tasks', 'in-progress', 'high-priority', 'due-soon'].map((tabValue) => (
              <TabsContent key={tabValue} value={tabValue} className="space-y-4">
                {tasksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading Jira tasks...</span>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {getFilteredTasks(tabValue).length === 0 ? (
                      <Card>
                        <CardContent className="py-8">
                          <div className="text-center text-gray-500">
                            No tasks found for this filter.
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      getFilteredTasks(tabValue).map((task) => (
                        <Card key={task.id} className={`hover:shadow-md transition-shadow ${task.parent && task.parent.key === 'HIS-86' ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <Badge variant="outline" className={task.parent && task.parent.key === 'HIS-86' ? 'bg-blue-100 text-blue-800' : ''}>{task.key}</Badge>
                                  <Badge 
                                    className={getStatusBadgeColor(task.status.name, task.status.category)}
                                  >
                                    {task.status.name}
                                  </Badge>
                                  <Badge 
                                    variant="outline"
                                    className={getPriorityBadgeColor(task.priority.name)}
                                  >
                                    {task.priority.name}
                                  </Badge>
                                  {task.parent && task.parent.key === 'HIS-86' && (
                                    <Badge className="bg-blue-600 text-white">HIS-86 SUBTASK</Badge>
                                  )}
                                </div>
                                <CardTitle className="text-lg mb-1">{task.summary}</CardTitle>
                                {task.description && (
                                  <p className="text-sm text-gray-600 line-clamp-2">
                                    {task.description}
                                  </p>
                                )}
                              </div>
                              
                              <Button variant="ghost" size="sm" asChild>
                                <a 
                                  href={task.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              </Button>
                            </div>
                          </CardHeader>
                          
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                              <div>
                                <span className="text-gray-500">Assignee:</span>
                                <div className="font-medium">
                                  {task.assignee?.displayName || 'Unassigned'}
                                </div>
                              </div>
                              
                              <div>
                                <span className="text-gray-500">Reporter:</span>
                                <div className="font-medium">{task.reporter.displayName}</div>
                              </div>
                              
                              <div>
                                <span className="text-gray-500">Created:</span>
                                <div className="font-medium">{formatDate(task.created)}</div>
                              </div>
                              
                              <div>
                                <span className="text-gray-500">
                                  {task.dueDate ? 'Due Date:' : 'Updated:'}
                                </span>
                                <div className="font-medium">
                                  {task.dueDate ? formatDate(task.dueDate) : formatDate(task.updated)}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 justify-end border-t pt-3">
                              <button
                                onClick={() => navigate(`/jira-workflow/${task.key}`)}
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                              >
                                Start Workflow
                              </button>
                              <button
                                onClick={() => handleMismatchSummary(task.key)}
                                disabled={mismatchSummaryMutation.isPending}
                                className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
                              >
                                {mismatchSummaryMutation.isPending && mismatchSummaryMutation.variables === task.key 
                                  ? 'Processing...' 
                                  : 'Mismatch Summary'}
                              </button>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default JiraIntegration;