import { StaticSidebar } from "@/components/shared/StaticSidebar";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Mail, Search, Plus, FileText, CheckCircle, Settings,
  AlertCircle, User, Send, MessageSquare, GitMerge,
  FileCheck, Archive, X
} from "lucide-react";

export default function AgentOverview() {
  const [, setLocation] = useLocation();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => setLocation("/login"),
  });

  // Personal Lines — Insurance Quote Agents
  const agents = [
    {
      name: "Policy Data Extraction Agent",
      type: "policy_extractor",
      icon: <FileText className="h-5 w-5" />,
      description: "Reads the uploaded insurance policy PDF and extracts property address, coverage types, coverage limits, deductibles, endorsements, and all underwriting attributes with confidence scores.",
      color: "blue",
      workflow: "Personal Lines"
    },
    {
      name: "Geocoding & Address Validation Agent",
      type: "geocoding",
      icon: <Search className="h-5 w-5" />,
      description: "Calls Google Geocoder API to obtain precise latitude and longitude for the property address, validates the ZIP code, confirms the address exists in an insurable US territory.",
      color: "green",
      workflow: "Personal Lines"
    },
    {
      name: "Property Data Agent",
      type: "property_data",
      icon: <MessageSquare className="h-5 w-5" />,
      description: "Queries CoStar and CoreLogic to enrich property data: building size, year built, last renovation, roof age, construction type, occupancy classification, and tenant information.",
      color: "purple",
      workflow: "Personal Lines"
    },
    {
      name: "Geospatial Risk Assessment Agent",
      type: "geospatial_risk",
      icon: <AlertCircle className="h-5 w-5" />,
      description: "Analyzes satellite imagery for building and roof condition scores, calculates distance to fire stations (ISO class) and police stations, checks FEMA flood zones, and evaluates wildfire and other hazard indicators.",
      color: "orange",
      workflow: "Personal Lines"
    },
    {
      name: "Catastrophe Risk Evaluation Agent",
      type: "cat_risk",
      icon: <Settings className="h-5 w-5" />,
      description: "Evaluates exposure to earthquake (USGS seismic zones), hurricane, wildfire, and other major catastrophe zones using AIR/RMS hazard layers. Applies a 1.10× premium multiplier for high-risk zones.",
      color: "red",
      workflow: "Personal Lines"
    },
    {
      name: "Portfolio Concentration Agent",
      type: "portfolio_risk",
      icon: <GitMerge className="h-5 w-5" />,
      description: "Queries the insurer's existing portfolio database to calculate TIV concentration at ZIP code, county, and metro area levels. Applies a 1.10× premium multiplier when geographic concentration approaches threshold.",
      color: "yellow",
      workflow: "Personal Lines"
    },
    {
      name: "Quote Generation Agent",
      type: "quote_generator",
      icon: <FileCheck className="h-5 w-5" />,
      description: "Synthesises all risk data to compute the final annual premium with itemised breakdown (base rate, geospatial load, cat risk multiplier, portfolio multiplier). Produces a downloadable and printable PDF quote with full policy terms.",
      color: "indigo",
      workflow: "Personal Lines"
    },
  ];

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
                <h1 className="text-2xl font-bold text-foreground">Agent Overview</h1>
                <p className="text-muted-foreground mt-1">Personal Lines — Insurance Quote Pipeline · 7 agents running sequentially</p>
              </div>
              <div className="flex items-center space-x-3">
                <ThemeToggle />
                <div className="text-sm text-muted-foreground">Today: {new Date().toLocaleDateString()}</div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6 flex-1 overflow-auto">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 pb-6">
              {agents.map((agent, idx) => (
                <Card key={agent.type} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-full bg-${agent.color}-100 dark:bg-${agent.color}-900`}>
                        {agent.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base leading-tight">{agent.name}</CardTitle>
                        </div>
                        <CardDescription className="text-xs mt-0.5">Step {idx + 1} of {agents.length} · {agent.workflow}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{agent.description}</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Status</span>
                        <span className="text-green-600 font-medium">Live</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Execution Order</span>
                        <span className="text-foreground">Sequential — Step {idx + 1}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Human Approval</span>
                        <span className={idx === 0 || idx === 6 ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>
                          {idx === 0 ? 'Required — Data Review' : idx === 6 ? 'Required — Quote Review' : 'Automatic'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
