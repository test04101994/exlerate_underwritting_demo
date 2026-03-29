import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

interface SlipDataExtractionFormProps {
  sessionId: string;
  onApprove: (data: any) => void;
  onReject: (reason?: string) => void;
  ticketKey?: string;
}

interface CsvSlipData {
  slip_id: string;
  token: string;
  slip_reference: string;
  lloyd_syndicate: string;
  lead_underwriter: string;
  underwriter_email: string;
  risk_category: string;
  policy_inception_date: string;
  policy_expiry_date: string;
  coverage_territory: string;
  currency: string;
  policy_limits: string;
  deductible: string;
  premium_amount: string;
  brokerage_rate: string;
  total_sum_insured: string;
  risk_location: string;
  business_description: string;
  years_trading: string;
  annual_turnover: string;
  number_of_employees: string;
  previous_claims: string;
  risk_improvements: string;
  security_measures: string;
  compliance_certifications: string;
  financial_rating: string;
  reinsurance_arrangements: string;
  exclusions: string;
  warranties: string;
  conditions: string;
  email_subject: string;
}

// Convert slip data to extracted data format
const convertSlipToExtractedData = (slipData: CsvSlipData) => {
  return {
    slipId: slipData.slip_id,
    token: slipData.token,
    slipReference: slipData.slip_reference,
    lloydSyndicate: slipData.lloyd_syndicate,
    leadUnderwriter: slipData.lead_underwriter,
    underwriterEmail: slipData.underwriter_email,
    riskCategory: slipData.risk_category,
    policyInceptionDate: slipData.policy_inception_date,
    policyExpiryDate: slipData.policy_expiry_date,
    coverageTerritory: slipData.coverage_territory,
    currency: slipData.currency,
    policyLimits: slipData.policy_limits,
    deductible: slipData.deductible,
    premiumAmount: slipData.premium_amount,
    brokerageRate: slipData.brokerage_rate,
    totalSumInsured: slipData.total_sum_insured,
    riskLocation: slipData.risk_location,
    businessDescription: slipData.business_description,
    yearsTrading: slipData.years_trading,
    annualTurnover: slipData.annual_turnover,
    numberOfEmployees: slipData.number_of_employees,
    previousClaims: slipData.previous_claims,
    riskImprovements: slipData.risk_improvements,
    securityMeasures: slipData.security_measures,
    complianceCertifications: slipData.compliance_certifications,
    financialRating: slipData.financial_rating,
    reinsuranceArrangements: slipData.reinsurance_arrangements,
    exclusions: slipData.exclusions,
    warranties: slipData.warranties,
    conditions: slipData.conditions,
    emailSubject: slipData.email_subject
  };
};

export function SlipDataExtractionForm({ sessionId, onApprove, onReject, ticketKey }: SlipDataExtractionFormProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSlipId, setSelectedSlipId] = useState<string>(ticketKey || "SLP-2025-001");
  const [extractedData, setExtractedData] = useState<any>(null);

  // Fetch slip data from API
  const { data: slipData, isLoading, error } = useQuery({
    queryKey: ['/api/slip-data', selectedSlipId],
    queryFn: async () => {
      const response = await fetch(`/api/slip-data/${selectedSlipId}`);
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch slip data: ${response.statusText}`);
      }
      return await response.json() as CsvSlipData;
    },
    enabled: !!selectedSlipId
  });

  // Initialize extracted data when slip data loads
  useEffect(() => {
    if (slipData && !extractedData) {
      setExtractedData(convertSlipToExtractedData(slipData));
    }
  }, [slipData, extractedData]);

  const getConfidenceBadge = (level: string) => {
    const colors = {
      'High': 'bg-green-100 text-green-800',
      'Medium': 'bg-yellow-100 text-yellow-800', 
      'Low': 'bg-red-100 text-red-800'
    };
    return colors[level as keyof typeof colors] || colors.High;
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading slip data...</p>
      </div>
    );
  }

  // Show error state  
  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>Error loading slip data: {error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }

  // Show no data state
  if (!slipData) {
    return (
      <div className="p-8 text-center text-orange-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>No slip data available for ID: {selectedSlipId}</p>
      </div>
    );
  }

  const handleApprove = () => {
    onApprove(extractedData || slipData);
    toast({
      title: "Data Extraction Approved",
      description: "Workflow will continue with extracted data"
    });
  };

  const handleReject = () => {
    onReject("Data extraction rejected by user");
    toast({
      title: "Data Extraction Rejected", 
      description: "Workflow has been stopped",
      variant: "destructive"
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Data Extraction Review</h2>
        <p className="text-gray-600">Review and edit the extracted data before proceeding</p>
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <strong>Slip ID:</strong> {selectedSlipId}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span>Extracted Slip Information</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Slip Details */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Basic Slip Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="slipReference">Slip Reference</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="slipReference"
                    value={extractedData?.slipReference || slipData.slip_reference}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, slipReference: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="token">Token</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="token"
                    value={extractedData?.token || slipData.token}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, token: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="lloydSyndicate">Lloyd's Syndicate</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="lloydSyndicate"
                    value={extractedData?.lloydSyndicate || slipData.lloyd_syndicate}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, lloydSyndicate: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="leadUnderwriter">Lead Underwriter</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="leadUnderwriter"
                    value={extractedData?.leadUnderwriter || slipData.lead_underwriter}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, leadUnderwriter: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="underwriterEmail">Underwriter Email</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="underwriterEmail"
                    value={extractedData?.underwriterEmail || slipData.underwriter_email}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, underwriterEmail: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="riskCategory">Risk Category</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="riskCategory"
                    value={extractedData?.riskCategory || slipData.risk_category}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, riskCategory: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Details */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Policy Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="policyInceptionDate">Policy Inception Date</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="policyInceptionDate"
                    value={extractedData?.policyInceptionDate || slipData.policy_inception_date}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, policyInceptionDate: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="policyExpiryDate">Policy Expiry Date</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="policyExpiryDate"
                    value={extractedData?.policyExpiryDate || slipData.policy_expiry_date}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, policyExpiryDate: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="coverageTerritory">Coverage Territory</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="coverageTerritory"
                    value={extractedData?.coverageTerritory || slipData.coverage_territory}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, coverageTerritory: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="currency">Currency</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="currency"
                    value={extractedData?.currency || slipData.currency}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, currency: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="policyLimits">Policy Limits</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="policyLimits"
                    value={extractedData?.policyLimits || slipData.policy_limits}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, policyLimits: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="deductible">Deductible</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="deductible"
                    value={extractedData?.deductible || slipData.deductible}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, deductible: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Financial Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Financial Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="premiumAmount">Premium Amount</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="premiumAmount"
                    value={extractedData?.premiumAmount || slipData.premium_amount}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, premiumAmount: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="brokerageRate">Brokerage Rate</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="brokerageRate"
                    value={extractedData?.brokerageRate || slipData.brokerage_rate}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, brokerageRate: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="totalSumInsured">Total Sum Insured</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="totalSumInsured"
                    value={extractedData?.totalSumInsured || slipData.total_sum_insured}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, totalSumInsured: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Risk Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="riskLocation">Risk Location</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="riskLocation"
                    value={extractedData?.riskLocation || slipData.risk_location}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, riskLocation: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="businessDescription">Business Description</Label>
                <div className="flex items-start space-x-2">
                  <Input
                    id="businessDescription"
                    value={extractedData?.businessDescription || slipData.business_description}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, businessDescription: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Business Information */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Business Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="yearsTrading">Years Trading</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="yearsTrading"
                    value={extractedData?.yearsTrading || slipData.years_trading}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, yearsTrading: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="annualTurnover">Annual Turnover</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="annualTurnover"
                    value={extractedData?.annualTurnover || slipData.annual_turnover}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, annualTurnover: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="numberOfEmployees">Number of Employees</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="numberOfEmployees"
                    value={extractedData?.numberOfEmployees || slipData.number_of_employees}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, numberOfEmployees: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="financialRating">Financial Rating</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="financialRating"
                    value={extractedData?.financialRating || slipData.financial_rating}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, financialRating: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="previousClaims">Previous Claims</Label>
                <div className="flex items-start space-x-2">
                  <Input
                    id="previousClaims"
                    value={extractedData?.previousClaims || slipData.previous_claims}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, previousClaims: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Risk & Security */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Risk & Security</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="riskImprovements">Risk Improvements</Label>
                <div className="flex items-start space-x-2">
                  <Input
                    id="riskImprovements"
                    value={extractedData?.riskImprovements || slipData.risk_improvements}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, riskImprovements: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="securityMeasures">Security Measures</Label>
                <div className="flex items-start space-x-2">
                  <Input
                    id="securityMeasures"
                    value={extractedData?.securityMeasures || slipData.security_measures}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, securityMeasures: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="complianceCertifications">Compliance Certifications</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="complianceCertifications"
                    value={extractedData?.complianceCertifications || slipData.compliance_certifications}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, complianceCertifications: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="reinsuranceArrangements">Reinsurance Arrangements</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="reinsuranceArrangements"
                    value={extractedData?.reinsuranceArrangements || slipData.reinsurance_arrangements}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, reinsuranceArrangements: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('Medium')}>Medium</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Policy Terms */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">Policy Terms</h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="exclusions">Exclusions</Label>
                <div className="flex items-start space-x-2">
                  <Input
                    id="exclusions"
                    value={extractedData?.exclusions || slipData.exclusions}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, exclusions: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="warranties">Warranties</Label>
                <div className="flex items-start space-x-2">
                  <Input
                    id="warranties"
                    value={extractedData?.warranties || slipData.warranties}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, warranties: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="conditions">Conditions</Label>
                <div className="flex items-start space-x-2">
                  <Input
                    id="conditions"
                    value={extractedData?.conditions || slipData.conditions}
                    readOnly={!isEditing}
                    className={!isEditing ? "bg-gray-50" : ""}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, conditions: e.target.value }))}
                  />
                  <Badge className={getConfidenceBadge('High')}>High</Badge>
                </div>
              </div>
            </div>
          </div>

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
              >
                Reject & Stop
              </Button>
              <Button
                onClick={handleApprove}
                className="px-6 bg-green-600 hover:bg-green-700"
              >
                Approve & Continue
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}