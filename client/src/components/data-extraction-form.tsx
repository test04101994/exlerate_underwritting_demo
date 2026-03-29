import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, AlertCircle, Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getSubmissionDataById, getAvailableSubmissionIds, type CsvSubmissionData } from "@shared/csv-data";
import { getMultiPropertyDataBySubmissionId, hasMultipleProperties, type MultiPropertyCsvData } from "@shared/multi-property-csv-data";

interface ExtractedData {
  submissionId: string;
  brokerRefNumber: string;
  intermediaryName: string;
  brokerContactName: string;
  brokerEmail: string;
  targetPremium: string;
  effectiveDate: string;
  previousInsurer: string;
  insuranceDeclined: string;
  convictions: string;
  bankruptcy: string;
  claimsCount: string;
  // Policy Holder fields
  contactRole: string;
  title: string;
  firstName: string;
  middleName: string;
  surname: string;
  dateOfBirth: string;
  occupation: string;
  houseNumber: string;
  houseName: string;
  addressLine1: string;
  city: string;
  postcode: string;
  // Property fields
  propertyHouseNumber: string;
  propertyHouseName: string;
  propertyAddressLine1: string;
  propertyCity: string;
  propertyPostcode: string;
  coverType: string;
  buildingSumsInsured: string;
  contentSumsInsured: string;
  totalJewelleryValue: string;
  artCollectionsValue: string;
  solelyOccupied: string;
  propertyOwnership: string;
  propertyType: string;
  yearBuilt: string;
  numberOfBedrooms: string;
  listedBuilding: string;
  roofConstruction: string;
  wallConstruction: string;
  // Jewellery fields
  jewelleryType: string;
  jewelleryDescription: string;
  jewelleryValue: string;
}

interface DataExtractionFormProps {
  sessionId: string;
  onApprove: () => void;
  onReject: () => void;
}

export function DataExtractionForm({ sessionId, onApprove, onReject }: DataExtractionFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("UW-2025-001");
  
  // Get CSV data for selected submission ID
  const getCsvData = (submissionId: string): CsvSubmissionData | null => {
    return getSubmissionDataById(submissionId);
  };
  
  // Get multi-property CSV data for selected submission ID
  const getMultiPropertyCsvData = (submissionId: string): MultiPropertyCsvData | null => {
    return getMultiPropertyDataBySubmissionId(submissionId);
  };
  
  // Check if submission has multiple properties
  const isMultiProperty = (submissionId: string): boolean => {
    return hasMultipleProperties(submissionId);
  };
  
  // Helper function to get multi-property field value
  const getMultiPropertyFieldValue = (submissionId: string, field: keyof MultiPropertyCsvData): string => {
    const multiData = getMultiPropertyCsvData(submissionId);
    if (!multiData || !multiData[field]) return '';
    return multiData[field] as string;
  };
  
  // Helper function to format property address
  const formatPropertyAddress = (submissionId: string, propertyNumber: 1 | 2): string => {
    const multiData = getMultiPropertyCsvData(submissionId);
    if (!multiData) return '';
    
    const houseNumber = propertyNumber === 1 ? multiData.property1_house_number : multiData.property2_house_number;
    const houseName = propertyNumber === 1 ? multiData.property1_house_name : multiData.property2_house_name;
    const addressLine1 = propertyNumber === 1 ? multiData.property1_address_line1 : multiData.property2_address_line1;
    const city = propertyNumber === 1 ? multiData.property1_city : multiData.property2_city;
    const postcode = propertyNumber === 1 ? multiData.property1_postcode : multiData.property2_postcode;
    
    return `${houseNumber} ${houseName}, ${addressLine1}, ${city} ${postcode}`;
  };
  
  // Convert CSV data to ExtractedData format
  const convertCsvToExtractedData = (csvData: CsvSubmissionData): ExtractedData => {
    return {
      submissionId: csvData.submission_id,
      brokerRefNumber: csvData.broker_ref_hu_number,
      intermediaryName: csvData.intermediary_name,
      brokerContactName: csvData.broker_contact_name,
      brokerEmail: csvData.broker_email,
      targetPremium: csvData.target_premium,
      effectiveDate: csvData.quote_effective_date,
      previousInsurer: csvData.previous_insurer,
      insuranceDeclined: csvData.insurance_declined,
      convictions: csvData.convictions,
      bankruptcy: csvData.bankruptcy,
      claimsCount: csvData.claims_count,
      // Policy Holder fields
      contactRole: csvData.contact_role,
      title: csvData.title,
      firstName: csvData.first_name,
      middleName: csvData.middle_name,
      surname: csvData.surname,
      dateOfBirth: csvData.date_of_birth,
      occupation: csvData.occupation,
      houseNumber: csvData.house_number,
      houseName: csvData.house_name,
      addressLine1: csvData.address_line1,
      city: csvData.city,
      postcode: csvData.postcode,
      // Property fields
      propertyHouseNumber: csvData.property_house_number,
      propertyHouseName: csvData.property_house_name,
      propertyAddressLine1: csvData.property_address_line1,
      propertyCity: csvData.property_city,
      propertyPostcode: csvData.property_postcode,
      coverType: csvData.cover_type,
      buildingSumsInsured: csvData.building_sums_insured,
      contentSumsInsured: csvData.content_sums_insured,
      totalJewelleryValue: csvData.total_jewellery_value,
      artCollectionsValue: csvData.art_collections_value,
      solelyOccupied: csvData.solely_occupied,
      propertyOwnership: csvData.property_ownership,
      propertyType: csvData.property_type,
      yearBuilt: csvData.year_built,
      numberOfBedrooms: csvData.number_of_bedrooms,
      listedBuilding: csvData.listed_building,
      roofConstruction: csvData.roof_construction,
      wallConstruction: csvData.wall_construction,
      // Jewellery fields
      jewelleryType: csvData.jewellery_type,
      jewelleryDescription: csvData.jewellery_description,
      jewelleryValue: csvData.jewellery_value
    };
  };
  
  // Initialize extracted data from CSV
  const initializeExtractedData = () => {
    const csvData = getCsvData(selectedSubmissionId);
    if (csvData) {
      return convertCsvToExtractedData(csvData);
    }
    // Fallback to default data if CSV lookup fails
    return {
      submissionId: "UW-2025-001",
      brokerRefNumber: "REF-HU-2024001",
      intermediaryName: "Marsh UK Limited",
      brokerContactName: "Sarah Johnson",
      brokerEmail: "sarah.johnson@marsh.com",
      targetPremium: "£8,500",
      effectiveDate: "2024-07-15",
      previousInsurer: "Aviva Insurance",
      insuranceDeclined: "No",
      convictions: "No",
      bankruptcy: "No",
      claimsCount: "1",
      contactRole: "Broker",
      title: "Ms",
      firstName: "Sarah",
      middleName: "Elizabeth",
      surname: "Johnson",
      dateOfBirth: "1985-03-22",
      occupation: "Senior Insurance Broker",
      houseNumber: "45",
      houseName: "Oakwood House",
      addressLine1: "Victoria Street",
      city: "Manchester",
      postcode: "M1 4BT",
      propertyHouseNumber: "45",
      propertyHouseName: "Oakwood House",
      propertyAddressLine1: "Victoria Street",
      propertyCity: "Manchester",
      propertyPostcode: "M1 4BT",
      coverType: "Combined",
      buildingSumsInsured: "£750,000",
      contentSumsInsured: "£150,000",
      totalJewelleryValue: "£85,000",
      artCollectionsValue: "£40,000",
      solelyOccupied: "Yes",
      propertyOwnership: "Owner Occupied",
      propertyType: "Victorian Terrace",
      yearBuilt: "1898",
      numberOfBedrooms: "5",
      listedBuilding: "Grade II Listed",
      roofConstruction: "Slate",
      wallConstruction: "Stone",
      jewelleryType: "Necklace",
      jewelleryDescription: "Victorian diamond necklace with sapphires",
      jewelleryValue: "£25,000"
    };
  };
  
  const [extractedData, setExtractedData] = useState<ExtractedData>(initializeExtractedData());

  const confidenceScores = {
    submissionId: 0.99,
    brokerRefNumber: 0.96,
    intermediaryName: 0.98,
    brokerContactName: 0.97,
    brokerEmail: 0.99,
    targetPremium: 0.93,
    effectiveDate: 0.95,
    previousInsurer: 0.94,
    insuranceDeclined: 0.96,
    convictions: 0.97,
    bankruptcy: 0.98,
    claimsCount: 0.92,
    // Policy Holder confidence scores
    contactRole: 0.94,
    title: 0.98,
    firstName: 0.97,
    middleName: 0.95,
    surname: 0.98,
    dateOfBirth: 0.96,
    occupation: 0.93,
    houseNumber: 0.96,
    houseName: 0.94,
    addressLine1: 0.97,
    city: 0.98,
    postcode: 0.99,
    // Property confidence scores
    propertyHouseNumber: 0.96,
    propertyHouseName: 0.94,
    propertyAddressLine1: 0.97,
    propertyCity: 0.98,
    propertyPostcode: 0.99,
    coverType: 0.94,
    buildingSumsInsured: 0.89,
    contentSumsInsured: 0.91,
    totalJewelleryValue: 0.87,
    artCollectionsValue: 0.86,
    solelyOccupied: 0.95,
    propertyOwnership: 0.93,
    propertyType: 0.92,
    yearBuilt: 0.90,
    numberOfBedrooms: 0.94,
    listedBuilding: 0.88,
    roofConstruction: 0.89,
    wallConstruction: 0.91,
    // Jewellery confidence scores
    jewelleryType: 0.87,
    jewelleryDescription: 0.85,
    jewelleryValue: 0.88
  };

  const approveExtractionMutation = useMutation({
    mutationFn: async (data: ExtractedData) => {
      await apiRequest('POST', `/api/workflows/${sessionId}/approve-extraction`, { extractedData: data });
    },
    onSuccess: () => {
      toast({
        title: "Data Extraction Approved",
        description: "Workflow will continue to next agent",
      });
      onApprove();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to approve extraction",
        variant: "destructive",
      });
    }
  });

  const rejectExtractionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', `/api/workflows/${sessionId}/reject-extraction`);
    },
    onSuccess: () => {
      toast({
        title: "Data Extraction Rejected",
        description: "Workflow has been stopped",
        variant: "destructive",
      });
      onReject();
    }
  });

  const handleInputChange = (field: keyof ExtractedData, value: string) => {
    setExtractedData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmissionChange = (submissionId: string) => {
    setSelectedSubmissionId(submissionId);
    const csvData = getCsvData(submissionId);
    if (csvData) {
      setExtractedData(convertCsvToExtractedData(csvData));
    }
  };

  const handleApprove = () => {
    approveExtractionMutation.mutate(extractedData);
  };

  const handleReject = () => {
    rejectExtractionMutation.mutate();
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.95) return <Badge variant="default" className="bg-green-100 text-green-800">High ({Math.round(score * 100)}%)</Badge>;
    if (score >= 0.85) return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Medium ({Math.round(score * 100)}%)</Badge>;
    return <Badge variant="destructive" className="bg-red-100 text-red-800">Low ({Math.round(score * 100)}%)</Badge>;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Data Extraction Completed - Human Review Required
            </CardTitle>
            <CardDescription>
              Please review the extracted data below. You can edit any fields if needed, then approve or reject the extraction.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
          
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Extracted Information</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Submission ID:</Label>
                <div className="px-3 py-1 bg-gray-100 border rounded-md text-sm font-medium">
                  {selectedSubmissionId}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-2"
              >
                {isEditing ? <Save className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                {isEditing ? 'Save Changes' : 'Edit Data'}
              </Button>
            </div>
          </div>

          {/* General Details Section */}
          <div className="space-y-4">
            <div className="border-b pb-2">
              <h4 className="text-lg font-semibold text-gray-900">GENERAL DETAILS</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Row 1: Broker Info */}
              <div className="space-y-2">
                <Label htmlFor="brokerRefNumber" className="text-sm font-medium">Broker Ref HU Number</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="brokerRefNumber"
                      value={extractedData.brokerRefNumber}
                      onChange={(e) => handleInputChange('brokerRefNumber', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.brokerRefNumber}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.brokerRefNumber)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="intermediaryName" className="text-sm font-medium">Intermediary Name</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="intermediaryName"
                      value={extractedData.intermediaryName}
                      onChange={(e) => handleInputChange('intermediaryName', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.intermediaryName}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.intermediaryName)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="brokerContactName" className="text-sm font-medium">Broker Contact Name</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="brokerContactName"
                      value={extractedData.brokerContactName}
                      onChange={(e) => handleInputChange('brokerContactName', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.brokerContactName}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.brokerContactName)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="brokerEmail" className="text-sm font-medium">Broker Email</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="brokerEmail"
                      value={extractedData.brokerEmail}
                      onChange={(e) => handleInputChange('brokerEmail', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.brokerEmail}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.brokerEmail)}
                </div>
              </div>
              
              {/* Row 2: Premium & Dates */}
              <div className="space-y-2">
                <Label htmlFor="targetPremium" className="text-sm font-medium">Target Premium</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="targetPremium"
                      value={extractedData.targetPremium}
                      onChange={(e) => handleInputChange('targetPremium', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.targetPremium}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.targetPremium)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="effectiveDate" className="text-sm font-medium">Quote Effective Date</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="effectiveDate"
                      value={extractedData.effectiveDate}
                      onChange={(e) => handleInputChange('effectiveDate', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.effectiveDate}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.effectiveDate)}
                </div>
              </div>
              
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="previousInsurer" className="text-sm font-medium">Previous Insurer</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="previousInsurer"
                      value={extractedData.previousInsurer}
                      onChange={(e) => handleInputChange('previousInsurer', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.previousInsurer}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.previousInsurer)}
                </div>
              </div>
            </div>
          </div>

          {/* Policy Holders Section */}
          <div className="space-y-4">
            <div className="border-b pb-2">
              <h4 className="text-lg font-semibold text-gray-900">POLICY HOLDERS</h4>
              <div className="bg-blue-50 px-3 py-2 rounded-md mt-2">
                <span className="text-sm font-medium text-blue-900">Policy Holder 1</span>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactRole" className="text-sm font-medium">Contact Role</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="contactRole"
                      value={extractedData.contactRole}
                      onChange={(e) => handleInputChange('contactRole', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.contactRole}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.contactRole)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="title" className="text-sm font-medium">Title</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="title"
                      value={extractedData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.title}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.title)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-sm font-medium">First Name</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="firstName"
                      value={extractedData.firstName}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.firstName}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.firstName)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="middleName" className="text-sm font-medium">Middle Name</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="middleName"
                      value={extractedData.middleName}
                      onChange={(e) => handleInputChange('middleName', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.middleName}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.middleName)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="surname" className="text-sm font-medium">Surname</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="surname"
                      value={extractedData.surname}
                      onChange={(e) => handleInputChange('surname', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.surname}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.surname)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth" className="text-sm font-medium">Date of Birth</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="dateOfBirth"
                      value={extractedData.dateOfBirth}
                      onChange={(e) => handleInputChange('dateOfBirth', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.dateOfBirth}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.dateOfBirth)}
                </div>
              </div>
              
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="occupation" className="text-sm font-medium">Occupation</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="occupation"
                      value={extractedData.occupation}
                      onChange={(e) => handleInputChange('occupation', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.occupation}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.occupation)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="houseNumber" className="text-sm font-medium">House Number</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="houseNumber"
                      value={extractedData.houseNumber}
                      onChange={(e) => handleInputChange('houseNumber', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.houseNumber}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.houseNumber)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="houseName" className="text-sm font-medium">House Name</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="houseName"
                      value={extractedData.houseName}
                      onChange={(e) => handleInputChange('houseName', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.houseName}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.houseName)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="addressLine1" className="text-sm font-medium">Address Line 1</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="addressLine1"
                      value={extractedData.addressLine1}
                      onChange={(e) => handleInputChange('addressLine1', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.addressLine1}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.addressLine1)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-medium">City</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="city"
                      value={extractedData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.city}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.city)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="postcode" className="text-sm font-medium">Postcode</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="postcode"
                      value={extractedData.postcode}
                      onChange={(e) => handleInputChange('postcode', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.postcode}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.postcode)}
                </div>
              </div>
            </div>
          </div>

          {/* Property Information Section - Single or Multi-Property */}
          {isMultiProperty(selectedSubmissionId) ? (
            // Multi-Property Section
            <div className="space-y-6">
              {/* Property 1 - Blue Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-lg font-semibold text-gray-900">PROPERTY 1 DETAILS</h4>
                  <div className="bg-blue-50 border-l-4 border-blue-400 px-3 py-2 rounded-r-lg mt-2">
                    <span className="text-sm font-medium text-blue-900">Primary Residence</span>
                  </div>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Property 1 Fields */}
                    <div className="space-y-2 md:col-span-3">
                      <Label htmlFor="property1Address" className="text-sm font-medium">Property Address</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Address"
                            value={formatPropertyAddress(selectedSubmissionId, 1)}
                            onChange={(e) => handleInputChange('property1Address', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {formatPropertyAddress(selectedSubmissionId, 1)}
                          </div>
                        )}
                        {getConfidenceBadge(0.96)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property1Type" className="text-sm font-medium">Property Type</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Type"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_type')}
                            onChange={(e) => handleInputChange('property1Type', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_type')}
                          </div>
                        )}
                        {getConfidenceBadge(0.94)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property1Value" className="text-sm font-medium">Property Value</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Value"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_value')}
                            onChange={(e) => handleInputChange('property1Value', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_value')}
                          </div>
                        )}
                        {getConfidenceBadge(0.91)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property1YearBuilt" className="text-sm font-medium">Year Built</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1YearBuilt"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_year_built')}
                            onChange={(e) => handleInputChange('property1YearBuilt', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_year_built')}
                          </div>
                        )}
                        {getConfidenceBadge(0.78)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property1Bedrooms" className="text-sm font-medium">Bedrooms</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Bedrooms"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_bedrooms')}
                            onChange={(e) => handleInputChange('property1Bedrooms', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_bedrooms')}
                          </div>
                        )}
                        {getConfidenceBadge(0.85)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property1Bathrooms" className="text-sm font-medium">Bathrooms</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Bathrooms"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_bathrooms')}
                            onChange={(e) => handleInputChange('property1Bathrooms', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_bathrooms')}
                          </div>
                        )}
                        {getConfidenceBadge(0.82)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property1Construction" className="text-sm font-medium">Construction Type</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Construction"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_construction_type')}
                            onChange={(e) => handleInputChange('property1Construction', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_construction_type')}
                          </div>
                        )}
                        {getConfidenceBadge(0.76)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property1Roof" className="text-sm font-medium">Roof Type</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Roof"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_roof_type')}
                            onChange={(e) => handleInputChange('property1Roof', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_roof_type')}
                          </div>
                        )}
                        {getConfidenceBadge(0.73)}
                      </div>
                    </div>
                    
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="property1Security" className="text-sm font-medium">Security Features</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property1Security"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property1_security_features')}
                            onChange={(e) => handleInputChange('property1Security', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property1_security_features')}
                          </div>
                        )}
                        {getConfidenceBadge(0.65)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Property 2 - Green Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-lg font-semibold text-gray-900">PROPERTY 2 DETAILS</h4>
                  <div className="bg-green-50 border-l-4 border-green-400 px-3 py-2 rounded-r-lg mt-2">
                    <span className="text-sm font-medium text-green-900">Holiday Home</span>
                  </div>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Property 2 Fields */}
                    <div className="space-y-2 md:col-span-3">
                      <Label htmlFor="property2Address" className="text-sm font-medium">Property Address</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Address"
                            value={formatPropertyAddress(selectedSubmissionId, 2)}
                            onChange={(e) => handleInputChange('property2Address', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {formatPropertyAddress(selectedSubmissionId, 2)}
                          </div>
                        )}
                        {getConfidenceBadge(0.93)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property2Type" className="text-sm font-medium">Property Type</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Type"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_type')}
                            onChange={(e) => handleInputChange('property2Type', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_type')}
                          </div>
                        )}
                        {getConfidenceBadge(0.89)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property2Value" className="text-sm font-medium">Property Value</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Value"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_value')}
                            onChange={(e) => handleInputChange('property2Value', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_value')}
                          </div>
                        )}
                        {getConfidenceBadge(0.88)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property2YearBuilt" className="text-sm font-medium">Year Built</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2YearBuilt"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_year_built')}
                            onChange={(e) => handleInputChange('property2YearBuilt', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_year_built')}
                          </div>
                        )}
                        <Badge className="bg-yellow-100 text-yellow-800">Medium (81%)</Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property2Bedrooms" className="text-sm font-medium">Bedrooms</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Bedrooms"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_bedrooms')}
                            onChange={(e) => handleInputChange('property2Bedrooms', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_bedrooms')}
                          </div>
                        )}
                        <Badge className="bg-yellow-100 text-yellow-800">Medium (86%)</Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property2Bathrooms" className="text-sm font-medium">Bathrooms</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Bathrooms"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_bathrooms')}
                            onChange={(e) => handleInputChange('property2Bathrooms', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_bathrooms')}
                          </div>
                        )}
                        <Badge className="bg-yellow-100 text-yellow-800">Medium (84%)</Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property2Construction" className="text-sm font-medium">Construction Type</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Construction"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_construction_type')}
                            onChange={(e) => handleInputChange('property2Construction', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_construction_type')}
                          </div>
                        )}
                        {getConfidenceBadge(0.79)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="property2Roof" className="text-sm font-medium">Roof Type</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Roof"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_roof_type')}
                            onChange={(e) => handleInputChange('property2Roof', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_roof_type')}
                          </div>
                        )}
                        {getConfidenceBadge(0.77)}
                      </div>
                    </div>
                    
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="property2Security" className="text-sm font-medium">Security Features</Label>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <Input
                            id="property2Security"
                            value={getMultiPropertyFieldValue(selectedSubmissionId, 'property2_security_features')}
                            onChange={(e) => handleInputChange('property2Security', e.target.value)}
                            className="flex-1"
                          />
                        ) : (
                          <div className="flex-1 p-2 bg-white rounded-md text-sm border">
                            {getMultiPropertyFieldValue(selectedSubmissionId, 'property2_security_features')}
                          </div>
                        )}
                        {getConfidenceBadge(0.62)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Summary Information - Gray Section */}
              <div className="space-y-4">
                <div className="border-b pb-2">
                  <h4 className="text-lg font-semibold text-gray-900">SUMMARY INFORMATION</h4>
                  <div className="bg-gray-50 border-l-4 border-gray-400 px-3 py-2 rounded-r-lg mt-2">
                    <span className="text-sm font-medium text-gray-900">Multi-Property Summary</span>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-gray-400">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="totalPropertyValue" className="text-sm font-medium">Total Property Value</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 p-2 bg-white rounded-md text-sm border font-medium">
                          {getMultiPropertyFieldValue(selectedSubmissionId, 'total_property_value')}
                        </div>
                        {getConfidenceBadge(1.00)}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="propertyCount" className="text-sm font-medium">Number of Properties</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 p-2 bg-white rounded-md text-sm border font-medium">
                          2
                        </div>
                        {getConfidenceBadge(1.00)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Single Property Section (Original)
            <div className="space-y-4">
              <div className="border-b pb-2">
                <h4 className="text-lg font-semibold text-gray-900">PROPERTY INFORMATION</h4>
                <div className="bg-blue-50 px-3 py-2 rounded-md mt-2">
                  <span className="text-sm font-medium text-blue-900">Property 1</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="propertyAddressLine1" className="text-sm font-medium">Property Address Line 1</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="propertyAddressLine1"
                      value={extractedData.propertyAddressLine1}
                      onChange={(e) => handleInputChange('propertyAddressLine1', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.propertyAddressLine1}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.propertyAddressLine1)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="propertyType" className="text-sm font-medium">Property Type</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="propertyType"
                      value={extractedData.propertyType}
                      onChange={(e) => handleInputChange('propertyType', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.propertyType}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.propertyType)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="coverType" className="text-sm font-medium">Cover Type</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="coverType"
                      value={extractedData.coverType}
                      onChange={(e) => handleInputChange('coverType', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.coverType}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.coverType)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="buildingSumsInsured" className="text-sm font-medium">Building Sums Insured (£)</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="buildingSumsInsured"
                      value={extractedData.buildingSumsInsured}
                      onChange={(e) => handleInputChange('buildingSumsInsured', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.buildingSumsInsured}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.buildingSumsInsured)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="contentSumsInsured" className="text-sm font-medium">Content Sums Insured (£)</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="contentSumsInsured"
                      value={extractedData.contentSumsInsured}
                      onChange={(e) => handleInputChange('contentSumsInsured', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.contentSumsInsured}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.contentSumsInsured)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="yearBuilt" className="text-sm font-medium">Year Built</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="yearBuilt"
                      value={extractedData.yearBuilt}
                      onChange={(e) => handleInputChange('yearBuilt', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.yearBuilt}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.yearBuilt)}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="listedBuilding" className="text-sm font-medium">Listed Building</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="listedBuilding"
                      value={extractedData.listedBuilding}
                      onChange={(e) => handleInputChange('listedBuilding', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.listedBuilding}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.listedBuilding)}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Specified Jewellery Details Section */}
          <div className="space-y-4">
            <div className="border-b pb-2">
              <h4 className="text-lg font-semibold text-gray-900">SPECIFIED JEWELLERY DETAILS</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalJewelleryValue" className="text-sm font-medium">Total Jewellery Value (£)</Label>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <Input
                      id="totalJewelleryValue"
                      value={extractedData.totalJewelleryValue}
                      onChange={(e) => handleInputChange('totalJewelleryValue', e.target.value)}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 p-2 bg-gray-50 rounded-md text-sm">
                      {extractedData.totalJewelleryValue}
                    </div>
                  )}
                  {getConfidenceBadge(confidenceScores.totalJewelleryValue)}
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
                  {Object.values(confidenceScores).filter(score => score >= 0.95).length}
                </div>
                <div className="text-sm text-green-600">High Confidence</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-yellow-700">
                  {Object.values(confidenceScores).filter(score => score >= 0.85 && score < 0.95).length}
                </div>
                <div className="text-sm text-yellow-600">Medium Confidence</div>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <div className="text-2xl font-bold text-red-700">
                  {Object.values(confidenceScores).filter(score => score < 0.85).length}
                </div>
                <div className="text-sm text-red-600">Low Confidence</div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Button
              onClick={handleApprove}
              disabled={approveExtractionMutation.isPending}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {approveExtractionMutation.isPending ? 'Processing...' : 'Approve & Continue'}
            </Button>
            <Button
              onClick={handleReject}
              variant="destructive"
              disabled={rejectExtractionMutation.isPending}
              className="flex-1"
            >
              {rejectExtractionMutation.isPending ? 'Processing...' : 'Reject & Stop'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}