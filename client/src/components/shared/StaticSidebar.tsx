import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link, useLocation } from "wouter";
import {
  Building,
  Activity,
  Eye,
  LogOut,
  Bot,
  BarChart2,
  Scale,
  ClipboardList
} from "lucide-react";
import exlLogo from "@/assets/exl-logo.svg";

interface StaticSidebarProps {
  onLogout?: () => void;
}

export function StaticSidebar({ onLogout }: StaticSidebarProps) {
  const [location] = useLocation();

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  return (
    <div className="h-full bg-background border-r border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center space-x-3">
          <img src={exlLogo} alt="EXL" className="h-8 w-auto" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">Agentic Platform</div>
          </div>
        </div>
      </div>

      {/* Scrollable middle section */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Platform Overview */}
        <div className="px-4 py-3">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Platform Overview</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium text-foreground">v3.2.1</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Uptime</span>
              <span className="font-medium text-green-600">99.9%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Speed</span>
              <span className="font-medium text-foreground">5 min avg</span>
            </div>
          </div>
        </div>

        {/* Connectors */}
        <div className="px-4 py-3 border-t border-border">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Connectors</h3>
          <div className="space-y-1">
            <Link href="/dashboard" className={`flex items-center px-3 py-2 rounded-md transition-colors ${
              location === '/dashboard' || location === '/'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <Building className="mr-3 h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">Mailbox</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
            </Link>
            <Link href="/jira-dashboard" className={`flex items-center px-3 py-2 rounded-md transition-colors ${
              location === '/jira-dashboard'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <Activity className="mr-3 h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">Jira Board</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
            </Link>
            <Link href="/claims" className={`flex items-center px-3 py-2 rounded-md transition-colors ${
              location === '/claims'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <Scale className="mr-3 h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">Claims</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
            </Link>
            <Link href="/pre-bind" className={`flex items-center px-3 py-2 rounded-md transition-colors ${
              location === '/pre-bind'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <ClipboardList className="mr-3 h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">Pre-Bind</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 py-3 border-t border-border">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">Quick Actions</h3>
          <div className="space-y-2">
            <Link href="/agent-overview" className={`flex items-center px-3 py-2 rounded-md transition-colors text-sm ${
              location === '/agent-overview'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <Bot className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="truncate">Agent Overview</span>
            </Link>
            <Link href="/langfuse-analytics" className={`flex items-center px-3 py-2 rounded-md transition-colors text-sm ${
              location === '/langfuse-analytics'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <BarChart2 className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="truncate">Langfuse Analytics</span>
            </Link>
          </div>
        </div>

        {/* System Status */}
        <div className="px-4 py-3 border-t border-border">
          <h3 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">System Status</h3>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">API</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600 font-medium">Online</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Jira</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600 font-medium">Connected</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Auto-Refresh</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600 font-medium">Active</span>
              </div>
            </div>
          </div>
        </div>

      </div>{/* end scrollable */}

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-border p-3 space-y-2">
        <ThemeToggle />
        <Button onClick={handleLogout} variant="outline" size="sm" className="w-full justify-start">
          <LogOut className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="truncate">Sign Out</span>
        </Button>
      </div>
    </div>
  );
}
