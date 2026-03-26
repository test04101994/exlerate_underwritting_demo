import { StaticSidebar } from "@/components/shared/StaticSidebar";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle } from "lucide-react";

export default function LangfuseAnalytics() {
  const [, setLocation] = useLocation();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => setLocation("/login"),
  });

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <PanelGroup direction="horizontal" className="h-full">
        <Panel defaultSize={18} minSize={14} maxSize={28} className="min-w-0">
          <StaticSidebar onLogout={() => logoutMutation.mutate()} />
        </Panel>
        <PanelResizeHandle className="w-1 bg-border hover:bg-blue-400 transition-colors cursor-col-resize" />
        <Panel className="overflow-auto flex flex-col min-w-0">
          {/* Header */}
          <div className="bg-card border-b border-border px-6 py-4 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Langfuse Analytics Dashboard</h1>
                <p className="text-muted-foreground mt-1">Real-time LLM observability, tracing, and cost analytics for all AI agent calls</p>
              </div>
              <div className="flex items-center space-x-3">
                <ThemeToggle />
                <div className="text-sm text-muted-foreground">Today: {new Date().toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto flex items-center justify-center">
            <div className="text-center space-y-6 p-8">
              <div className="w-20 h-20 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-10 h-10 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h4 className="text-xl font-semibold text-foreground mb-2">Langfuse Analytics</h4>
                <p className="text-muted-foreground mb-6">View detailed LLM traces, costs, and performance metrics</p>
              </div>
              <Button
                onClick={() => window.open('https://cloud.langfuse.com/project/cmfmcrd26004uad07xcyfhk6q/dashboards', '_blank')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3"
                size="lg"
              >
                Open Langfuse Dashboard
              </Button>
              <div className="mt-8 p-4 bg-card rounded-lg border border-border max-w-md mx-auto text-left">
                <h5 className="font-medium text-foreground mb-3">What you'll see:</h5>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Real-time traces of all AI agent calls</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Token usage and cost breakdowns</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Performance metrics and latency analysis</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Workflow-specific tracking and debugging</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
