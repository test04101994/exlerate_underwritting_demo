import type { WorkflowSession, Agent } from "@shared/schema";

interface WorkflowProgressProps {
  session?: WorkflowSession;
  agents: Agent[];
}

export function WorkflowProgress({ session, agents }: WorkflowProgressProps) {
  const getStepIcon = (name: string, type: string) => {
    switch (name.toLowerCase()) {
      case 'initialize': return 'fas fa-play';
      case 'research': return 'fas fa-search';
      case 'business assessment': return 'fas fa-clipboard-check';
      case 'analysis': case 'risk analysis': return 'fas fa-chart-line';
      case 'coverage options': return 'fas fa-shield-alt';
      case 'approval': case 'client review': case 'final approval': return 'fas fa-user';
      case 'write': case 'policy preparation': return 'fas fa-pen';
      case 'review': return 'fas fa-check-double';
      case 'complete': case 'complete setup': return 'fas fa-flag';
      default: return 'fas fa-circle';
    }
  };

  const steps = session?.config?.steps?.map(step => ({
    id: step.id,
    name: step.name,
    icon: getStepIcon(step.name, step.type)
  })) || [];

  const currentStep = session?.currentStep || 0;
  const currentStepName = steps[currentStep - 1]?.name || 'Waiting';

  const getStepStatus = (stepId: number) => {
    if (stepId < currentStep) return 'complete';
    if (stepId === currentStep) return 'active';
    return 'pending';
  };

  const getStepColor = (status: string) => {
    switch (status) {
      case 'complete':
        return 'bg-success';
      case 'active':
        return 'bg-warning';
      default:
        return 'bg-gray-300';
    }
  };

  const getConnectorColor = (stepId: number) => {
    return stepId < currentStep ? 'bg-success' : 'bg-gray-300';
  };

  return (
    <div className="bg-surface border-b border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900">Workflow Progress</h3>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Current Step:</span>
          <span className="text-xs font-medium text-warning">{currentStepName}</span>
        </div>
      </div>
      
      {/* Workflow Steps */}
      <div className="flex items-center space-x-4 overflow-x-auto pb-2">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          const isActive = status === 'active';
          const isComplete = status === 'complete';
          
          return (
            <div key={step.id} className="flex items-center space-x-4 flex-shrink-0">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center relative ${getStepColor(status)}`}>
                  {isComplete ? (
                    <i className="fas fa-check text-white text-xs"></i>
                  ) : isActive ? (
                    <i className="fas fa-spinner fa-spin text-white text-xs"></i>
                  ) : (
                    <i className={`${step.icon} text-gray-500 text-xs`}></i>
                  )}
                </div>
                <span className={`text-xs mt-1 text-center ${
                  isActive ? 'text-warning font-medium' : 
                  isComplete ? 'text-success' : 
                  'text-gray-500'
                }`}>
                  {step.name}
                </span>
              </div>
              
              {/* Connector */}
              {index < steps.length - 1 && (
                <div className={`w-12 h-0.5 flex-shrink-0 ${getConnectorColor(step.id)}`}></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
