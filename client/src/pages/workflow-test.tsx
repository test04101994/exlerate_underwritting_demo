import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export default function WorkflowTest() {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("GET", "/api/workflows");
      const data = await response.json();
      setWorkflows(data);
    } catch (error) {
      console.error("Failed to load workflows:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkflowDetail = async (sessionId: string) => {
    setLoading(true);
    try {
      const response = await apiRequest("GET", `/api/workflows/${sessionId}`);
      const data = await response.json();
      setSelectedWorkflow(data);
    } catch (error) {
      console.error("Failed to load workflow detail:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">EXLerate AI - Workflow Test</h1>
        
        {/* Workflows List */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Available Workflows</h2>
          {loading ? (
            <div>Loading...</div>
          ) : (
            <div className="space-y-4">
              {workflows.map((workflow) => (
                <div key={workflow.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold">{workflow.title}</h3>
                      <p className="text-sm text-gray-600">ID: {workflow.sessionId}</p>
                      <p className="text-sm text-gray-600">Type: {workflow.config?.workflowType || 'research'}</p>
                    </div>
                    <div className="text-right">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        workflow.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {workflow.status}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Step {workflow.currentStep} of {workflow.totalSteps}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => loadWorkflowDetail(workflow.sessionId)}
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Workflow Details */}
        {selectedWorkflow && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Workflow Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Session Info */}
              <div>
                <h3 className="font-semibold mb-2">Session Information</h3>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(selectedWorkflow.session, null, 2)}
                </pre>
              </div>

              {/* Agents */}
              <div>
                <h3 className="font-semibold mb-2">Agents ({selectedWorkflow.agents.length})</h3>
                <div className="space-y-2">
                  {selectedWorkflow.agents.map((agent: any) => (
                    <div key={agent.id} className="bg-gray-50 p-3 rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{agent.name}</h4>
                          <p className="text-sm text-gray-600">{agent.type}</p>
                          <p className="text-xs text-gray-500">{agent.description}</p>
                        </div>
                        <div className="text-right">
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            agent.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            agent.status === 'complete' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {agent.status}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Progress: {agent.progress}%
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <div className="md:col-span-2">
                <h3 className="font-semibold mb-2">Messages ({selectedWorkflow.messages.length})</h3>
                <div className="bg-gray-50 p-4 rounded max-h-64 overflow-y-auto">
                  {selectedWorkflow.messages.map((message: any) => (
                    <div key={message.id} className="mb-2 p-2 bg-white rounded">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm">{message.sender}</span>
                        <span className="text-xs text-gray-500">{message.type}</span>
                      </div>
                      <p className="text-sm">{message.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}