import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Edit2, Save, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// Define the CSV slip data interface
export interface CsvSlipData {
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

interface SlipDataExtractionFormProps {
  sessionId: string;
  onApprove: (data: any) => void;
  onReject: (reason?: string) => void;
  ticketKey?: string; // For Jira workflows
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
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  // Use ticketKey for Jira workflows, fallback to default slip ID for regular slip workflows
  const [selectedSlipId, setSelectedSlipId] = useState<string>(ticketKey || "SLP-2025-001");
  const [extractedData, setExtractedData] = useState<any>(null);
  
  // Fetch slip data from API instead of direct filesystem access
  const { data: slipData, isLoading, error } = useQuery({
    queryKey: ['/api/slip-data', selectedSlipId],
    queryFn: async () => {
      console.log(`[SlipDataForm] Fetching data for ${selectedSlipId} via API`);
      const response = await fetch(`/api/slip-data/${selectedSlipId}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[SlipDataForm] No data found for slip ID: ${selectedSlipId}`);
          return null;
        }
        throw new Error(`Failed to fetch slip data: ${response.statusText}`);
      }
      const data = await response.json() as CsvSlipData;
      console.log(`[SlipDataForm] API returned data for ${selectedSlipId}:`, data.lead_underwriter);
      return data;
    },
    enabled: !!selectedSlipId
  });
  
  // Initialize extracted data when slip data loads
  useEffect(() => {
    if (slipData && !extractedData) {
      setExtractedData(convertSlipToExtractedData(slipData));
    }
  }, [slipData, extractedData]);
  
  // Show loading or error states
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p>Loading slip data...</p>
      </div>
    );
  }
  
  if (error) {
    console.error('[SlipDataForm] API error:', error);
    return (
      <div className="p-8 text-center text-red-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>Error loading slip data: {error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    );
  }
  
  // Handle case where slip data is not found
  if (!slipData) {
    return (
      <div className="p-8 text-center text-orange-600">
        <AlertCircle className="w-8 h-8 mx-auto mb-4" />
        <p>No slip data available for ID: {selectedSlipId}</p>
        <p className="text-sm text-gray-500 mt-2">
          Please check the slip ID or contact support if this slip should exist.
        </p>
      </div>
    );
  }
  
  const getConfidenceLevel = (field: string) => {
    // Simulate confidence levels based on field type
    const confidenceMap: { [key: string]: { level: string; score: number } } = {
      // High confidence fields
      'slipId': { level: 'High', score: 99 },
      'slipReference': { level: 'High', score: 97 },
      'lloydSyndicate': { level: 'High', score: 98 },
      'leadUnderwriter': { level: 'High', score: 96 },
      'underwriterEmail': { level: 'High', score: 95 },
      'riskCategory': { level: 'High', score: 94 },
      'policyInceptionDate': { level: 'High', score: 98 },
      'policyExpiryDate': { level: 'High', score: 98 },
      'coverageTerritory': { level: 'High', score: 93 },
      'currency': { level: 'High', score: 99 },
      'policyLimits': { level: 'High', score: 92 },
      'deductible': { level: 'High', score: 91 },
      'premiumAmount': { level: 'High', score: 90 },
      'brokerageRate': { level: 'Medium', score: 85 },
      'totalSumInsured': { level: 'High', score: 89 },
      'riskLocation': { level: 'Medium', score: 83 },
      'businessDescription': { level: 'Medium', score: 82 },
      'yearsTrading': { level: 'Medium', score: 87 },
      'annualTurnover': { level: 'Medium', score: 81 },
      'numberOfEmployees': { level: 'Medium', score: 84 },
      'previousClaims': { level: 'Low', score: 78 },
      'riskImprovements': { level: 'Low', score: 75 },
      'securityMeasures': { level: 'Low', score: 76 },
      'complianceCertifications': { level: 'Medium', score: 80 },
      'financialRating': { level: 'High', score: 88 },
      'reinsuranceArrangements': { level: 'Medium', score: 86 },
      'exclusions': { level: 'High', score: 93 },
      'warranties': { level: 'High', score: 91 },
      'conditions': { level: 'High', score: 90 }
    };
    
    return confidenceMap[field] || { level: 'Medium', score: 85 };
  };

  const getConfidenceBadge = (field: string) => {
    const { level, score } = getConfidenceLevel(field);
    if (level === 'High') return <Badge variant="default" className="bg-green-100 text-green-800">High ({score}%)</Badge>;
    if (level === 'Medium') return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Medium ({score}%)</Badge>;
    return <Badge variant="destructive" className="bg-red-100 text-red-800">Low ({score}%)</Badge>;
  };

  // Calculate confidence level counts
  const allFields = [
    'slipId', 'slipReference', 'lloydSyndicate', 'leadUnderwriter', 'underwriterEmail',
    'riskCategory', 'coverageTerritory', 'policyInceptionDate', 'policyExpiryDate',
    'currency', 'policyLimits', 'deductible', 'premiumAmount', 'brokerageRate',
    'totalSumInsured', 'riskLocation', 'businessDescription', 'yearsTrading',
    'annualTurnover', 'numberOfEmployees', 'previousClaims', 'riskImprovements',
    'securityMeasures', 'complianceCertifications', 'financialRating',
    'reinsuranceArrangements', 'exclusions', 'warranties', 'conditions'
  ];

  const highConfidenceCount = allFields.filter(field => getConfidenceLevel(field).level === 'High').length;
  const mediumConfidenceCount = allFields.filter(field => getConfidenceLevel(field).level === 'Medium').length;
  const lowConfidenceCount = allFields.filter(field => getConfidenceLevel(field).level === 'Low').length;
  
  const handleSlipChange = (value: string) => {
    setSelectedSlipId(value);
  };
  
  const handleApprove = () => {
    if (!extractedData) return;
    
    toast({
      title: "Data Approved",
      description: "Slip data extraction has been approved. Continuing with workflow...",
      variant: "default",
    });
    
    onApprove(extractedData);
  };
  
  const handleReject = () => {
    toast({
      title: "Data Rejected",
      description: "Slip data extraction has been rejected.",
      variant: "destructive",
    });
    
    onReject("Data extraction quality insufficient");
  };
  
  if (!extractedData) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Slip Data Available</h3>
              <p className="text-sm text-muted-foreground">
                No slip data found for ID: {selectedSlipId}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Slip Data Extraction Completed - Human Review Required
            </CardTitle>
            <CardDescription>
              Please review the extracted slip data below. You can edit any fields if needed, then approve or reject the extraction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Extracted Lloyd's Market Information</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="slipSelect" className="text-sm font-medium">
                  {ticketKey ? "Jira Ticket:" : "Slip ID:"}
                </Label>
                {ticketKey ? (
                  // For Jira workflows, show read-only ticket key
                  <div className="px-3 py-2 bg-blue-50 border rounded-md text-sm font-medium text-blue-800 min-w-[140px]">
                    {selectedSlipId}
                  </div>
                ) : (
                  // For slip workflows, show dropdown selection
                  <Select value={selectedSlipId} onValueChange={handleSlipChange}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Select ID" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableSlipIds().map((id) => (
                        <SelectItem key={id} value={id}>
                          {id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2"
              >
                {isEditing ? (
                  <>
                    <Save className="h-4 w-4" />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Slip Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slipReference" className="text-sm font-medium">Slip Reference</Label>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Input
                    id="slipReference"
                    value={extractedData.slipReference}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, slipReference: e.target.value }))}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                    {extractedData.slipReference}
                  </div>
                )}
                {getConfidenceBadge('slipReference')}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lloydSyndicate" className="text-sm font-medium">Lloyd's Syndicate</Label>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Input
                    id="lloydSyndicate"
                    value={extractedData.lloydSyndicate}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, lloydSyndicate: e.target.value }))}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                    {extractedData.lloydSyndicate}
                  </div>
                )}
                {getConfidenceBadge('lloydSyndicate')}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="leadUnderwriter" className="text-sm font-medium">Lead Underwriter</Label>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Input
                    id="leadUnderwriter"
                    value={extractedData.leadUnderwriter}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, leadUnderwriter: e.target.value }))}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                    {extractedData.leadUnderwriter}
                  </div>
                )}
                {getConfidenceBadge('leadUnderwriter')}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="underwriterEmail" className="text-sm font-medium">Underwriter Email</Label>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Input
                    id="underwriterEmail"
                    value={extractedData.underwriterEmail}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, underwriterEmail: e.target.value }))}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                    {extractedData.underwriterEmail}
                  </div>
                )}
                {getConfidenceBadge('underwriterEmail')}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="riskCategory" className="text-sm font-medium">Risk Category</Label>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Input
                    id="riskCategory"
                    value={extractedData.riskCategory}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, riskCategory: e.target.value }))}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                    {extractedData.riskCategory}
                  </div>
                )}
                {getConfidenceBadge('riskCategory')}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="coverageTerritory" className="text-sm font-medium">Coverage Territory</Label>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <Input
                    id="coverageTerritory"
                    value={extractedData.coverageTerritory}
                    onChange={(e) => setExtractedData(prev => ({ ...prev, coverageTerritory: e.target.value }))}
                    className="flex-1"
                  />
                ) : (
                  <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                    {extractedData.coverageTerritory}
                  </div>
                )}
                {getConfidenceBadge('coverageTerritory')}
              </div>
            </div>
          </div>

          {/* Policy Details */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold">Policy Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="policyInceptionDate" className="text-sm font-medium">Policy Inception Date</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="policyInceptionDate"
                      value={extractedData.policyInceptionDate}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, policyInceptionDate: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.policyInceptionDate}
                    </div>
                  )}
                  {getConfidenceBadge('policyInceptionDate')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="policyExpiryDate" className="text-sm font-medium">Policy Expiry Date</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="policyExpiryDate"
                      value={extractedData.policyExpiryDate}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, policyExpiryDate: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.policyExpiryDate}
                    </div>
                  )}
                  {getConfidenceBadge('policyExpiryDate')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="text-sm font-medium">Currency</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="currency"
                      value={extractedData.currency}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, currency: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.currency}
                    </div>
                  )}
                  {getConfidenceBadge('currency')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="policyLimits" className="text-sm font-medium">Policy Limits</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="policyLimits"
                      value={extractedData.policyLimits}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, policyLimits: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.policyLimits}
                    </div>
                  )}
                  {getConfidenceBadge('policyLimits')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deductible" className="text-sm font-medium">Deductible</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="deductible"
                      value={extractedData.deductible}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, deductible: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.deductible}
                    </div>
                  )}
                  {getConfidenceBadge('deductible')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="premiumAmount" className="text-sm font-medium">Premium Amount</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="premiumAmount"
                      value={extractedData.premiumAmount}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, premiumAmount: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.premiumAmount}
                    </div>
                  )}
                  {getConfidenceBadge('premiumAmount')}
                </div>
              </div>
            </div>
          </div>

          {/* Risk Information */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold">Risk Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="riskLocation" className="text-sm font-medium">Risk Location</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="riskLocation"
                      value={extractedData.riskLocation}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, riskLocation: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.riskLocation}
                    </div>
                  )}
                  {getConfidenceBadge('riskLocation')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessDescription" className="text-sm font-medium">Business Description</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="businessDescription"
                      value={extractedData.businessDescription}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, businessDescription: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.businessDescription}
                    </div>
                  )}
                  {getConfidenceBadge('businessDescription')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="yearsTrading" className="text-sm font-medium">Years Trading</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="yearsTrading"
                      value={extractedData.yearsTrading}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, yearsTrading: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.yearsTrading}
                    </div>
                  )}
                  {getConfidenceBadge('yearsTrading')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="annualTurnover" className="text-sm font-medium">Annual Turnover</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="annualTurnover"
                      value={extractedData.annualTurnover}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, annualTurnover: e.target.value }))}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.annualTurnover}
                    </div>
                  )}
                  {getConfidenceBadge('annualTurnover')}
                </div>
              </div>
            </div>
          </div>

          {/* Terms and Conditions */}
          <div className="space-y-4">
            <h4 className="text-md font-semibold">Terms and Conditions</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="exclusions" className="text-sm font-medium">Exclusions</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Textarea
                      id="exclusions"
                      value={extractedData.exclusions}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, exclusions: e.target.value }))}
                      className="flex-1"
                      rows={3}
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm min-h-[76px]">
                      {extractedData.exclusions}
                    </div>
                  )}
                  {getConfidenceBadge('exclusions')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="warranties" className="text-sm font-medium">Warranties</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Textarea
                      id="warranties"
                      value={extractedData.warranties}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, warranties: e.target.value }))}
                      className="flex-1"
                      rows={3}
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm min-h-[76px]">
                      {extractedData.warranties}
                    </div>
                  )}
                  {getConfidenceBadge('warranties')}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="conditions" className="text-sm font-medium">Conditions</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Textarea
                      id="conditions"
                      value={extractedData.conditions}
                      onChange={(e) => setExtractedData(prev => ({ ...prev, conditions: e.target.value }))}
                      className="flex-1"
                      rows={3}
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm min-h-[76px]">
                      {extractedData.conditions}
                    </div>
                  )}
                  {getConfidenceBadge('conditions')}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium">Insurance Product Data Quality Summary</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-green-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-green-700">
                  {highConfidenceCount}
                </div>
                <div className="text-sm text-green-600">High Confidence</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-yellow-700">
                  {mediumConfidenceCount}
                </div>
                <div className="text-sm text-yellow-600">Medium Confidence</div>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-red-700">
                  {lowConfidenceCount}
                </div>
                <div className="text-sm text-red-600">Low Confidence</div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              onClick={handleApprove}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              Approve & Continue
            </Button>
            <Button
              onClick={handleReject}
              variant="destructive"
              className="flex-1"
            >
              Reject & Stop
            </Button>
          </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}