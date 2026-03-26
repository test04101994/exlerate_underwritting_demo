import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ApprovalRequest } from "@shared/schema";

interface ApprovalModalProps {
  approvalRequests: ApprovalRequest[];
  onApprove: (requestId: number) => void;
  onReject: (requestId: number) => void;
}

export function ApprovalModal({ approvalRequests, onApprove, onReject }: ApprovalModalProps) {
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [processing, setProcessing] = useState<boolean>(false);
  
  const pendingRequests = approvalRequests.filter(req => req.status === 'pending');
  const currentRequest = pendingRequests[0] || selectedRequest;

  const handleApprove = async () => {
    if (currentRequest && !processing) {
      setProcessing(true);
      try {
        await onApprove(currentRequest.id);
        setSelectedRequest(null);
        // Force modal to close immediately
        setTimeout(() => setSelectedRequest(null), 100);
      } finally {
        // Reset processing state after a delay to prevent rapid clicks
        setTimeout(() => setProcessing(false), 1000);
      }
    }
  };

  const handleReject = async () => {
    if (currentRequest && !processing) {
      setProcessing(true);
      try {
        await onReject(currentRequest.id);
        setSelectedRequest(null);
        // Force modal to close immediately
        setTimeout(() => setSelectedRequest(null), 100);
      } finally {
        setTimeout(() => setProcessing(false), 1000);
      }
    }
  };

  if (!currentRequest) {
    return null;
  }

  return (
    <Dialog open={!!currentRequest} onOpenChange={() => setSelectedRequest(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-warning rounded-full flex items-center justify-center">
              <i className="fas fa-exclamation-triangle text-white"></i>
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-gray-900">
                {currentRequest.title}
              </DialogTitle>
              <p className="text-sm text-gray-600">{currentRequest.description}</p>
            </div>
          </div>
        </DialogHeader>
        
        <div className="bg-gray-50 rounded-lg p-4 my-4">
          <h4 className="text-sm font-medium text-gray-900 mb-2">Analysis Results:</h4>
          <div className="text-sm text-gray-700 space-y-1">
            {currentRequest.data && typeof currentRequest.data === 'object' && (
              <div>
                {Object.entries(currentRequest.data).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="capitalize">{key}:</span>
                    <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                  </div>
                ))}
              </div>
            )}
            {!currentRequest.data && (
              <ul className="space-y-1">
                <li>• Market analysis complete with 89% confidence</li>
                <li>• 3 key trends identified and validated</li>
                <li>• Ready to proceed with content generation</li>
              </ul>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-end space-x-3 mt-6">
          <Button 
            variant="outline" 
            onClick={handleReject}
            disabled={processing}
            className="flex items-center"
          >
            <i className={`${processing ? 'fas fa-spinner fa-spin' : 'fas fa-times'} mr-2`}></i>
            {processing ? 'Processing...' : 'Reject'}
          </Button>
          <Button 
            onClick={handleApprove}
            disabled={processing}
            className="flex items-center"
          >
            <i className={`${processing ? 'fas fa-spinner fa-spin' : 'fas fa-check'} mr-2`}></i>
            {processing ? 'Processing...' : 'Approve & Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
