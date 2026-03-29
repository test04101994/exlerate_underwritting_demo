import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import JiraDashboard from "@/pages/jira-dashboard";
import JiraConfigPage from "@/pages/jira-config";
import CredentialConfig from "@/pages/credential-config";
import AgentTesting from "@/pages/agent-testing";
import DataValidation from "@/pages/data-validation";
import SubmissionsQueue from "@/pages/submissions-queue";

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
      <Route path="/" component={() => <ProtectedRoute component={JiraDashboard} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={JiraDashboard} />} />
      <Route path="/jira-config" component={() => <ProtectedRoute component={JiraConfigPage} />} />
      <Route path="/credential-config" component={() => <ProtectedRoute component={CredentialConfig} />} />
      <Route path="/agent-testing" component={() => <ProtectedRoute component={AgentTesting} />} />
      <Route path="/submissions" component={() => <ProtectedRoute component={SubmissionsQueue} />} />
      <Route path="/data-validation/:extractionId" component={() => <ProtectedRoute component={DataValidation} />} />
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
