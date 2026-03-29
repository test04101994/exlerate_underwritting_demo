import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Bot,
  Inbox,
  LogOut,
  PanelLeftClose,
} from "lucide-react";
import exlLogo from "@/assets/exl-logo.svg";

interface StaticSidebarProps {
  onLogout?: () => void;
  onCollapse?: () => void;
}

export function StaticSidebar({ onLogout, onCollapse }: StaticSidebarProps) {
  const [location] = useLocation();

  const handleLogout = () => {
    if (onLogout) onLogout();
  };

  return (
    <div className="h-full bg-background border-r border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <img src={exlLogo} alt="EXL" className="h-8 w-auto flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">Underwriting Platform</div>
              <div className="text-xs text-muted-foreground truncate">AI-Powered</div>
            </div>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Hide sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
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
              location === '/dashboard' || location === '/' || location === '/jira-dashboard'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <Activity className="mr-3 h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">Post Bind Quality Assurance</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
            </Link>
            <Link href="/submissions" className={`flex items-center px-3 py-2 rounded-md transition-colors ${
              location === '/submissions'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              <Inbox className="mr-3 h-4 w-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">New Business</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <span className="text-xs text-green-600 dark:text-green-400">Active</span>
                </div>
              </div>
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
