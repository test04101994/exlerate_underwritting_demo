import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, AlertCircle, Edit2, Save, X, Video, Square } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useScreenRecording } from "@/hooks/use-screen-recording";

interface UnifiedDataExtractionFormProps {
  sessionId: string;
  workflowType: 'slip' | 'jira';
  caseId?: string;
  ticketKey?: string;
  onApprove: (data: any) => void;
  onReject: (reason?: string) => void;
}

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'number' | 'date';
  confidence: 'High' | 'Medium' | 'Low';
  section: string;
  required?: boolean;
  fullWidth?: boolean;
}

interface SectionConfig {
  title: string;
  fields: FieldConfig[];
}

// Configuration for different workflow types
const getFormConfig = (workflowType: string): SectionConfig[] => {
  switch (workflowType) {
    case 'slip':
      return [
        {
          title: "Basic Slip Information",
          fields: [
            { key: 'slip_reference', label: 'Slip Reference', type: 'text', confidence: 'High', section: 'basic' },
            { key: 'token', label: 'Token', type: 'text', confidence: 'High', section: 'basic' },
            { key: 'lloyd_syndicate', label: "Lloyd's Syndicate", type: 'text', confidence: 'High', section: 'basic' },
            { key: 'lead_underwriter', label: 'Lead Underwriter', type: 'text', confidence: 'High', section: 'basic' },
            { key: 'underwriter_email', label: 'Underwriter Email', type: 'email', confidence: 'High', section: 'basic' },
            { key: 'risk_category', label: 'Risk Category', type: 'text', confidence: 'High', section: 'basic' }
          ]
        },
        {
          title: "Policy Details",
          fields: [
            { key: 'policy_inception_date', label: 'Policy Inception Date', type: 'date', confidence: 'High', section: 'policy' },
            { key: 'policy_expiry_date', label: 'Policy Expiry Date', type: 'date', confidence: 'High', section: 'policy' },
            { key: 'coverage_territory', label: 'Coverage Territory', type: 'text', confidence: 'Medium', section: 'policy' },
            { key: 'currency', label: 'Currency', type: 'text', confidence: 'High', section: 'policy' },
            { key: 'policy_limits', label: 'Policy Limits', type: 'text', confidence: 'High', section: 'policy' },
            { key: 'deductible', label: 'Deductible', type: 'text', confidence: 'High', section: 'policy' }
          ]
        },
        {
          title: "Financial Information",
          fields: [
            { key: 'premium_amount', label: 'Premium Amount', type: 'text', confidence: 'High', section: 'financial' },
            { key: 'brokerage_rate', label: 'Brokerage Rate', type: 'text', confidence: 'High', section: 'financial' },
            { key: 'total_sum_insured', label: 'Total Sum Insured', type: 'text', confidence: 'High', section: 'financial' }
          ]
        },
        {
          title: "Business Information",
          fields: [
            { key: 'years_trading', label: 'Years Trading', type: 'text', confidence: 'High', section: 'business' },
            { key: 'annual_turnover', label: 'Annual Turnover', type: 'text', confidence: 'High', section: 'business' },
            { key: 'number_of_employees', label: 'Number of Employees', type: 'text', confidence: 'High', section: 'business' },
            { key: 'financial_rating', label: 'Financial Rating', type: 'text', confidence: 'Medium', section: 'business' },
            { key: 'previous_claims', label: 'Previous Claims', type: 'textarea', confidence: 'Medium', section: 'business', fullWidth: true }
          ]
        },
        {
          title: "Risk & Security",
          fields: [
            { key: 'risk_improvements', label: 'Risk Improvements', type: 'textarea', confidence: 'Medium', section: 'risk', fullWidth: true },
            { key: 'security_measures', label: 'Security Measures', type: 'textarea', confidence: 'Medium', section: 'risk', fullWidth: true },
            { key: 'compliance_certifications', label: 'Compliance Certifications', type: 'text', confidence: 'High', section: 'risk' },
            { key: 'reinsurance_arrangements', label: 'Reinsurance Arrangements', type: 'text', confidence: 'Medium', section: 'risk' }
          ]
        },
        {
          title: "Policy Terms",
          fields: [
            { key: 'exclusions', label: 'Exclusions', type: 'textarea', confidence: 'High', section: 'terms', fullWidth: true },
            { key: 'warranties', label: 'Warranties', type: 'textarea', confidence: 'High', section: 'terms', fullWidth: true },
            { key: 'conditions', label: 'Conditions', type: 'textarea', confidence: 'High', section: 'terms', fullWidth: true }
          ]
        }
      ];

    case 'jira':
      // Jira workflows use the same comprehensive form as slip workflows
      return [
        {
          title: "Basic Slip Information",
          fields: [
            { key: 'slip_reference', label: 'Slip Reference', type: 'text', confidence: 'High', section: 'basic' },
            { key: 'token', label: 'Token', type: 'text', confidence: 'High', section: 'basic' },
            { key: 'lloyd_syndicate', label: "Lloyd's Syndicate", type: 'text', confidence: 'High', section: 'basic' },
            { key: 'lead_underwriter', label: 'Lead Underwriter', type: 'text', confidence: 'High', section: 'basic' },
            { key: 'underwriter_email', label: 'Underwriter Email', type: 'email', confidence: 'High', section: 'basic' },
            { key: 'risk_category', label: 'Risk Category', type: 'text', confidence: 'High', section: 'basic' }
          ]
        },
        {
          title: "Policy Details",
          fields: [
            { key: 'policy_inception_date', label: 'Policy Inception Date', type: 'date', confidence: 'High', section: 'policy' },
            { key: 'policy_expiry_date', label: 'Policy Expiry Date', type: 'date', confidence: 'High', section: 'policy' },
            { key: 'coverage_territory', label: 'Coverage Territory', type: 'text', confidence: 'Medium', section: 'policy' },
            { key: 'currency', label: 'Currency', type: 'text', confidence: 'High', section: 'policy' },
            { key: 'policy_limits', label: 'Policy Limits', type: 'text', confidence: 'High', section: 'policy' },
            { key: 'deductible', label: 'Deductible', type: 'text', confidence: 'High', section: 'policy' }
          ]
        },
        {
          title: "Financial Information",
          fields: [
            { key: 'premium_amount', label: 'Premium Amount', type: 'text', confidence: 'High', section: 'financial' },
            { key: 'brokerage_rate', label: 'Brokerage Rate', type: 'text', confidence: 'High', section: 'financial' },
            { key: 'total_sum_insured', label: 'Total Sum Insured', type: 'text', confidence: 'High', section: 'financial' }
          ]
        },
        {
          title: "Business Information",
          fields: [
            { key: 'years_trading', label: 'Years Trading', type: 'text', confidence: 'High', section: 'business' },
            { key: 'annual_turnover', label: 'Annual Turnover', type: 'text', confidence: 'High', section: 'business' },
            { key: 'number_of_employees', label: 'Number of Employees', type: 'text', confidence: 'High', section: 'business' },
            { key: 'financial_rating', label: 'Financial Rating', type: 'text', confidence: 'Medium', section: 'business' },
            { key: 'previous_claims', label: 'Previous Claims', type: 'textarea', confidence: 'Medium', section: 'business', fullWidth: true }
          ]
        },
        {
          title: "Risk & Security",
          fields: [
            { key: 'risk_improvements', label: 'Risk Improvements', type: 'textarea', confidence: 'Medium', section: 'risk', fullWidth: true },
            { key: 'security_measures', label: 'Security Measures', type: 'textarea', confidence: 'Medium', section: 'risk', fullWidth: true },
            { key: 'compliance_certifications', label: 'Compliance Certifications', type: 'text', confidence: 'High', section: 'risk' },
            { key: 'reinsurance_arrangements', label: 'Reinsurance Arrangements', type: 'text', confidence: 'Medium', section: 'risk' }
          ]
        },
        {
          title: "Policy Terms",
          fields: [
            { key: 'exclusions', label: 'Exclusions', type: 'textarea', confidence: 'High', section: 'terms', fullWidth: true },
            { key: 'warranties', label: 'Warranties', type: 'textarea', confidence: 'High', section: 'terms', fullWidth: true },
            { key: 'conditions', label: 'Conditions', type: 'textarea', confidence: 'High', section: 'terms', fullWidth: true }
          ]
        }
      ];

    default:
      return [];
  }
};

export function UnifiedDataExtractionForm({ 
  sessionId, 
  workflowType, 
  caseId, 
  ticketKey, 
  onApprove, 
  onReject 
}: UnifiedDataExtractionFormProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [extractedData, setExtractedData] = useState<any>({});
  const [isUploading, setIsUploading] = useState(false);
  
  const { 
    isRecording, 
    recordingTime, 
    error: recordingError,
    startRecording, 
    stopRecording 
  } = useScreenRecording();

  // Get configuration for this workflow type
  const formConfig = getFormConfig(workflowType);
  const dataSourceId = ticketKey || caseId || 'default';

  // Fetch data based on workflow type - use relative URLs to avoid CORS issues
  const { data: sourceData, isLoading, error } = useQuery({
    queryKey: [`/api/slip-data`, dataSourceId],
    queryFn: async () => {
      let endpoint = '';
      
      endpoint = `/api/slip-data/${dataSourceId}`;
      
      console.log(`[UnifiedDataExtractionForm] Fetching from: ${endpoint}`);
      
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Include cookies for session
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[UnifiedDataExtractionForm] Data not found for ${dataSourceId}`);
          return null;
        }
        const errorText = await response.text();
        console.error(`[UnifiedDataExtractionForm] Error response (${response.status}):`, errorText);
        throw new Error(`Failed to fetch ${workflowType} data: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[UnifiedDataExtractionForm] Successfully fetched data for ${dataSourceId}:`, data ? 'YES' : 'NO');
      return data;
    },
    enabled: !!dataSourceId,
    retry: 1, // Only retry once on failure
    staleTime: 5 * 60 * 1000 // Cache for 5 minutes
  });

  // Initialize extracted data when source data loads
  useEffect(() => {
    if (sourceData && Object.keys(extractedData).length === 0) {
      setExtractedData(sourceData);
    }
  }, [sourceData, extractedData]);

  const getConfidenceBadge = (level: string) => {
    const colors = {
      'High': 'bg-green-100 text-green-800',
      'Medium': 'bg-yellow-100 text-yellow-800', 
      'Low': 'bg-red-100 text-red-800'
    };
    return colors[level as keyof typeof colors] || colors.High;
  };

  const handleFieldChange = (fieldKey: string, value: string) => {
    setExtractedData((prev: any) => ({ ...prev, [fieldKey]: value }));
  };

  const handleApprove = async () => {
    try {
      // If recording, stop it and upload
      if (isRecording) {
        setIsUploading(true);
        toast({
          title: "Stopping Recording",
          description: "Please wait while we save your screen recording..."
        });

        const videoBlob = await stopRecording();
        
        // Convert blob to base64
        const reader = new FileReader();
        reader.readAsDataURL(videoBlob);
        reader.onloadend = async () => {
          const base64Video = reader.result as string;
          
          // Upload to server
          try {
            const response = await fetch(`/api/workflows/${sessionId}/upload-recording`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                videoData: base64Video,
                metadata: {
                  caseId: caseId,
                  ticketKey: ticketKey,
                  duration: recordingTime,
                  timestamp: new Date().toISOString()
                }
              }),
            });

            if (response.ok) {
              toast({
                title: "Recording Saved",
                description: "Screen recording has been shared in the chat"
              });
            } else {
              throw new Error('Upload failed');
            }
          } catch (error) {
            console.error('Failed to upload recording:', error);
            toast({
              title: "Recording Upload Failed",
              description: "Could not save the recording, but continuing workflow",
              variant: "destructive"
            });
          } finally {
            setIsUploading(false);
          }
        };
      }

      // Approve the data
      onApprove(extractedData || sourceData);
      toast({
        title: "Data Extraction Approved",
        description: "Workflow will continue with extracted data"
      });
    } catch (error) {
      console.error('Approval error:', error);
      setIsUploading(false);
    }
  };

  const handleReject = () => {
    onReject("Data extraction rejected by user");
    toast({
      title: "Data Extraction Rejected", 
      description: "Workflow has been stopped",
      variant: "destructive"
    });
  };

  const renderField = (field: FieldConfig) => {
    const value = extractedData[field.key] || sourceData?.[field.key] || '';
    
    if (field.type === 'textarea') {
      return (
        <div key={field.key} className={field.fullWidth ? "md:col-span-2" : ""}>
          <Label htmlFor={field.key}>{field.label}</Label>
          <div className="flex items-start space-x-2">
            <Textarea
              id={field.key}
              value={value}
              readOnly={!isEditing}
              className={!isEditing ? "bg-gray-50" : ""}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              rows={3}
            />
            <Badge className={getConfidenceBadge(field.confidence)}>{field.confidence}</Badge>
          </div>
        </div>
      );
    }

    return (
      <div key={field.key} className={field.fullWidth ? "md:col-span-2" : ""}>
        <Label htmlFor={field.key}>{field.label}</Label>
        <div className="flex items-center space-x-2">
          <Input
            id={field.key}
            type={field.type}
            value={value}
            readOnly={!isEditing}
            className={!isEditing ? "bg-gray-50" : ""}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
          />
          <Badge className={getConfidenceBadge(field.confidence)}>{field.confidence}</Badge>
        </div>
      </div>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading {workflowType} data...</p>
      </div>
    );
  }

  // Show error state  
  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>Error loading {workflowType} data: {error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }

  // Show no data state
  if (!sourceData) {
    return (
      <div className="p-8 text-center text-orange-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>No {workflowType} data available for ID: {dataSourceId}</p>
      </div>
    );
  }

  const getWorkflowTitle = () => {
    switch (workflowType) {
      case 'slip': return 'Slip Data Extraction Review';
      case 'jira': return 'Slip Data Extraction Review';
      default: return 'Data Extraction Review';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Recording Controls */}
      {!isRecording && !recordingError && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Video className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">Screen Recording Available</p>
                <p className="text-xs text-blue-700">Record your validation workflow to share in the chat</p>
              </div>
            </div>
            <Button
              onClick={startRecording}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-start-recording"
            >
              <Video className="w-4 h-4 mr-2" />
              Start Recording
            </Button>
          </div>
        </div>
      )}

      {isRecording && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-red-900">Recording</span>
              </div>
              <span className="text-sm text-red-700">{formatTime(recordingTime)}</span>
            </div>
            <p className="text-xs text-red-700">Recording will stop automatically when you approve</p>
          </div>
        </div>
      )}

      {recordingError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <p className="text-sm text-yellow-800">{recordingError}</p>
          </div>
        </div>
      )}

      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{getWorkflowTitle()}</h2>
        <p className="text-gray-600">Review and edit the extracted data before proceeding</p>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <strong>{workflowType === 'jira' ? 'Slip' : workflowType === 'slip' ? 'Slip' : 'Case'} ID:</strong> {dataSourceId}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span>Extracted {workflowType === 'jira' ? 'Slip' : workflowType.charAt(0).toUpperCase() + workflowType.slice(1)} Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {formConfig.map((section) => (
            <div key={section.title} className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
                {section.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields.map(renderField)}
              </div>
            </div>
          ))}

          {/* Action Buttons */}
          <div className="flex justify-between pt-6 border-t">
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                className="border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                {isEditing ? 'Stop Editing' : 'Edit Fields'}
              </Button>
            </div>
            
            <div className="flex space-x-3">
              <Button
                variant="destructive"
                onClick={handleReject}
                className="px-6"
                disabled={isUploading}
                data-testid="button-reject"
              >
                Reject & Stop
              </Button>
              <Button
                onClick={handleApprove}
                className="px-6 bg-green-600 hover:bg-green-700"
                disabled={isUploading}
                data-testid="button-approve"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Saving Recording...
                  </>
                ) : (
                  'Approve & Continue'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}