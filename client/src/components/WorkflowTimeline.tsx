import React from 'react';
import { Clock, CheckCircle, Circle, FileText, Shield, Calculator, Mail, Send, AlertCircle, Inbox, Search, FileCheck, MessageSquare, FolderCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineStep {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'pending';
  timestamp?: string;
  agentCount?: number;
  icon: React.ReactNode;
}

interface WorkflowTimelineProps {
  workflowType: string;
  currentStep: number;
  agents: any[];
  status?: string;
  agentProgress?: number;
  className?: string;
}

const getUnderwritingSteps = (currentStep: number, agents: any[], status?: string, agentProgress?: number): TimelineStep[] => {
  const steps = [
    {
      id: 'intake',
      title: 'Intake',
      description: 'Email received, classified, and case initialized (new or existing)',
      icon: <Inbox className="w-5 h-5" />,
      timestamp: '16 days ago',
      agentCount: 1
    },
    {
      id: 'analysis',
      title: 'Analysis',
      description: 'Document (MRC or form) parsed and evaluated for completeness, clauses, and business rules',
      icon: <Search className="w-5 h-5" />,
      timestamp: 'about 1 hour ago',
      agentCount: 3
    },
    {
      id: 'decision',
      title: 'Decision',
      description: 'Quote or clarification generated, human review applied if needed',
      icon: <FileCheck className="w-5 h-5" />,
      timestamp: 'about 1 hour ago',
      agentCount: 2
    },
    {
      id: 'negotiation',
      title: 'Negotiation',
      description: 'Broker responses handled, updates processed, quote revisions made if applicable',
      icon: <MessageSquare className="w-5 h-5" />,
      timestamp: 'about 1 hour ago',
      agentCount: 1
    },
    {
      id: 'binding_closure',
      title: 'Binding & Closure',
      description: 'Final agreement reached, binder generated, audit completed, case closed',
      icon: <FolderCheck className="w-5 h-5" />,
      timestamp: '',
      agentCount: 1
    }
  ];

  // Calculate current step based on business process stage logic
  const calculateCurrentStep = () => {
    if (status === 'completed') return 5; // Binding & Closure
    if (status === 'pending_approval') return 3; // Decision
    if (status === 'processing' && agentProgress) {
      if (agentProgress <= 2) return 1; // Intake
      if (agentProgress <= 4) return 2; // Analysis
      if (agentProgress <= 5) return 3; // Decision
      return 4; // Negotiation
    }
    return 1; // Default to Intake
  };

  const calculatedStep = calculateCurrentStep();

  return steps.map((step, index) => ({
    ...step,
    status: index + 1 < calculatedStep ? 'completed' : index + 1 === calculatedStep ? 'current' : 'pending'
  }));
};

const getSlipSteps = (currentStep: number, agents: any[], status?: string, agentProgress?: number): TimelineStep[] => {
  const steps = [
    {
      id: 'intake',
      title: 'Intake',
      description: 'Email received, classified, and case initialized (new or existing)',
      icon: <Inbox className="w-5 h-5" />,
      timestamp: '16 days ago',
      agentCount: 1
    },
    {
      id: 'analysis',
      title: 'Analysis',
      description: 'Document (MRC or form) parsed and evaluated for completeness, clauses, and business rules',
      icon: <Search className="w-5 h-5" />,
      timestamp: 'about 1 hour ago',
      agentCount: 3
    },
    {
      id: 'decision',
      title: 'Decision',
      description: 'Quote or clarification generated, human review applied if needed',
      icon: <FileCheck className="w-5 h-5" />,
      timestamp: 'about 1 hour ago',
      agentCount: 2
    },
    {
      id: 'negotiation',
      title: 'Negotiation',
      description: 'Broker responses handled, updates processed, quote revisions made if applicable',
      icon: <MessageSquare className="w-5 h-5" />,
      timestamp: 'about 1 hour ago',
      agentCount: 1
    },
    {
      id: 'binding_closure',
      title: 'Binding & Closure',
      description: 'Final agreement reached, binder generated, audit completed, case closed',
      icon: <FolderCheck className="w-5 h-5" />,
      timestamp: '',
      agentCount: 1
    }
  ];

  // Calculate current step based on business process stage logic
  const calculateCurrentStep = () => {
    if (status === 'completed') return 5; // Binding & Closure
    if (status === 'pending_approval') return 3; // Decision
    if (status === 'processing' && agentProgress) {
      if (agentProgress <= 2) return 1; // Intake
      if (agentProgress <= 4) return 2; // Analysis
      if (agentProgress <= 5) return 3; // Decision
      return 4; // Negotiation
    }
    return 1; // Default to Intake
  };

  const calculatedStep = calculateCurrentStep();

  return steps.map((step, index) => ({
    ...step,
    status: index + 1 < calculatedStep ? 'completed' : index + 1 === calculatedStep ? 'current' : 'pending'
  }));
};

export function WorkflowTimeline({ workflowType, currentStep, agents, status, agentProgress, className }: WorkflowTimelineProps) {
  if (workflowType !== 'underwriting' && workflowType !== 'slip') {
    return null;
  }

  const steps = workflowType === 'slip' ? getSlipSteps(currentStep, agents, status, agentProgress) : getUnderwritingSteps(currentStep, agents, status, agentProgress);

  return (
    <div className={cn("bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 p-6 rounded-lg border", className)}>
      <div className="flex items-center gap-2 mb-6">
        <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Submission Timeline</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 ml-2">
          Track the progress of your submission through the underwriting workflow
        </p>
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-start gap-4">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                step.status === 'completed' 
                  ? "bg-green-500 border-green-500 text-white"
                  : step.status === 'current'
                  ? "bg-blue-500 border-blue-500 text-white"
                  : "bg-gray-200 border-gray-300 text-gray-400 dark:bg-gray-700 dark:border-gray-600"
              )}>
                {step.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5" />
                ) : step.status === 'current' ? (
                  <Circle className="w-5 h-5 animate-pulse" />
                ) : (
                  step.icon
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={cn(
                  "w-0.5 h-8 mt-2 transition-colors",
                  step.status === 'completed' 
                    ? "bg-green-500"
                    : "bg-gray-200 dark:bg-gray-700"
                )} />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className={cn(
                  "font-medium transition-colors",
                  step.status === 'completed' 
                    ? "text-green-700 dark:text-green-400"
                    : step.status === 'current'
                    ? "text-blue-700 dark:text-blue-400"
                    : "text-gray-500 dark:text-gray-400"
                )}>
                  {step.title}
                </h3>
                {step.status === 'completed' && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
              </div>
              
              <p className={cn(
                "text-sm mb-2 transition-colors",
                step.status === 'completed' 
                  ? "text-green-600 dark:text-green-300"
                  : step.status === 'current'
                  ? "text-blue-600 dark:text-blue-300"
                  : "text-gray-500 dark:text-gray-400"
              )}>
                {step.description}
              </p>
              
              {step.timestamp && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                  {step.timestamp}
                </p>
              )}
              
              {step.agentCount && (
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  {step.agentCount} agent processed
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}