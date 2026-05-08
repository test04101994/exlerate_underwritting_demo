import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import WorkflowPage from "@/pages/workflow";
import WorkflowTest from "@/pages/workflow-test";
import Dashboard from "@/pages/dashboard";
import ClaimsDashboard from "@/pages/claims-dashboard";
import PreBindDashboard from "@/pages/pre-bind-dashboard";
import Login from "@/pages/login";
import LocalApiTestPage from "@/pages/local-api-test";
import ConfigurableFormTest from "@/pages/ConfigurableFormTest";
import JiraIntegration from "@/pages/jira-integration";
import JiraDashboard from "@/pages/jira-dashboard";
import JiraConfigPage from "@/pages/jira-config";  
import CredentialConfig from "@/pages/credential-config";
import ConfigurableDocumentsTest from "@/pages/configurable-documents-test";
import ConfigurableFormsTest from "@/pages/configurable-forms-test";
import AgentOverview from "@/pages/agent-overview";
import LangfuseAnalytics from "@/pages/langfuse-analytics";
// Flask test removed

import { useEffect } from "react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location, setLocation] = useLocation();
  
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/auth/user", {
        credentials: "include"
      });
      if (!response.ok) {
        if (response.status === 401) {
          return null;
        }
        throw new Error("Failed to fetch user");
      }
      return response.json();
    }
  });

  useEffect(() => {
    console.log('🔐 ProtectedRoute Auth Check:', { 
      location, 
      isLoading, 
      hasUser: !!user,
      userEmail: user?.email 
    });
    
    if (!isLoading && !user) {
      console.log('🔐 NO USER - REDIRECTING TO LOGIN from:', location);
      setLocation("/login");
    }
  }, [user, isLoading, setLocation, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/jira-dashboard" component={() => <ProtectedRoute component={JiraDashboard} />} />
      <Route path="/claims" component={() => <ProtectedRoute component={ClaimsDashboard} />} />
      <Route path="/pre-bind" component={() => <ProtectedRoute component={PreBindDashboard} />} />
      <Route path="/workflow" component={() => <ProtectedRoute component={WorkflowPage} />} />
      <Route path="/workflow/:sessionId" component={() => <ProtectedRoute component={WorkflowPage} />} />
      <Route path="/test" component={() => <ProtectedRoute component={WorkflowTest} />} />
      <Route path="/local-api-test" component={() => <ProtectedRoute component={LocalApiTestPage} />} />
      <Route path="/configurable-form-test" component={() => <ProtectedRoute component={ConfigurableFormTest} />} />
      <Route path="/configurable-documents-test" component={() => <ProtectedRoute component={ConfigurableDocumentsTest} />} />
      <Route path="/configurable-forms-test" component={() => <ProtectedRoute component={ConfigurableFormsTest} />} />
      {/* Flask test route removed */}
      <Route path="/jira" component={() => <ProtectedRoute component={JiraIntegration} />} />
      <Route path="/jira-config" component={() => <ProtectedRoute component={JiraConfigPage} />} />
      <Route path="/credential-config" component={() => <ProtectedRoute component={CredentialConfig} />} />
      <Route path="/jira-workflow/:ticketKey" component={() => <ProtectedRoute component={WorkflowPage} />} />
      <Route path="/agent-overview" component={() => <ProtectedRoute component={AgentOverview} />} />
      <Route path="/langfuse-analytics" component={() => <ProtectedRoute component={LangfuseAnalytics} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
