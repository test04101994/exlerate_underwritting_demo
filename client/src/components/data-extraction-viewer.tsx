import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, X } from "lucide-react";
import { getSubmissionDataById, getAvailableSubmissionIds, type CsvSubmissionData } from "@shared/csv-data";

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

interface DataExtractionViewerProps {
  sessionId: string;
  onClose: () => void;
}

export function DataExtractionViewer({ sessionId, onClose }: DataExtractionViewerProps) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("UW-2025-001");
  
  // Get CSV data for selected submission ID
  const getCsvData = (submissionId: string): CsvSubmissionData | null => {
    return getSubmissionDataById(submissionId);
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
      jewelleryValue: csvData.jewellery_value,
    };
  };
  
  const csvData = getCsvData(selectedSubmissionId);
  const extractedData = csvData ? convertCsvToExtractedData(csvData) : null;
  
  const getConfidenceLevel = (field: string) => {
    // Simulate confidence levels based on field type
    const confidenceMap: { [key: string]: { level: string; score: number } } = {
      // High confidence fields
      'submissionId': { level: 'High', score: 99 },
      'brokerRefNumber': { level: 'High', score: 96 },
      'intermediaryName': { level: 'High', score: 98 },
      'brokerContactName': { level: 'High', score: 97 },
      'brokerEmail': { level: 'High', score: 99 },
      'title': { level: 'High', score: 98 },
      'firstName': { level: 'High', score: 97 },
      'middleName': { level: 'High', score: 95 },
      'surname': { level: 'High', score: 98 },
      'dateOfBirth': { level: 'High', score: 96 },
      'effectiveDate': { level: 'High', score: 95 },
      
      // Medium confidence fields
      'targetPremium': { level: 'Medium', score: 93 },
      'previousInsurer': { level: 'Medium', score: 94 },
      'contactRole': { level: 'Medium', score: 94 },
      'occupation': { level: 'Medium', score: 92 },
      'propertyType': { level: 'Medium', score: 91 },
      'yearBuilt': { level: 'Medium', score: 90 },
      
      // Default medium confidence
      'default': { level: 'Medium', score: 92 }
    };
    
    return confidenceMap[field] || confidenceMap['default'];
  };
  
  const getConfidenceBadge = (field: string) => {
    const confidence = getConfidenceLevel(field);
    const colorClass = confidence.level === 'High' ? 'bg-green-100 text-green-800' : 
                      confidence.level === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
    return (
      <Badge className={`ml-2 text-xs ${colorClass}`}>
        {confidence.level} ({confidence.score}%)
      </Badge>
    );
  };
  
  if (!extractedData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Data Extraction - No Data Available</span>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>No data available for submission {selectedSubmissionId}</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Data Extraction Approved - View Only</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
          <CardDescription>
            Approved extracted data from CSV. This is a read-only view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Submission Selection */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Label htmlFor="submission-select">Submission ID:</Label>
              <Select value={selectedSubmissionId} onValueChange={setSelectedSubmissionId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select submission" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableSubmissionIds().map(id => (
                    <SelectItem key={id} value={id}>{id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="outline" className="px-3 py-1">
              Approved Data
            </Badge>
          </div>
          
          {/* General Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">General Details</CardTitle>
              <CardDescription>Pre-populated from CSV data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Broker Ref HU Number</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.brokerRefNumber}
                    {getConfidenceBadge('brokerRefNumber')}
                  </div>
                </div>
                <div>
                  <Label>Intermediary Name</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.intermediaryName}
                    {getConfidenceBadge('intermediaryName')}
                  </div>
                </div>
                <div>
                  <Label>Broker Contact Name</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.brokerContactName}
                    {getConfidenceBadge('brokerContactName')}
                  </div>
                </div>
                <div>
                  <Label>Broker Email</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.brokerEmail}
                    {getConfidenceBadge('brokerEmail')}
                  </div>
                </div>
                <div>
                  <Label>Target Premium</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.targetPremium}
                    {getConfidenceBadge('targetPremium')}
                  </div>
                </div>
                <div>
                  <Label>Quote Effective Date</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.effectiveDate}
                    {getConfidenceBadge('effectiveDate')}
                  </div>
                </div>
                <div>
                  <Label>Previous Insurer</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.previousInsurer}
                    {getConfidenceBadge('previousInsurer')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Policy Holders */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Policy Holders</CardTitle>
              <CardDescription>Individual CSV field data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-sm font-medium text-blue-600 mb-2">Policy Holder 1</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Contact Role</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {extractedData.contactRole}
                      {getConfidenceBadge('contactRole')}
                    </div>
                  </div>
                  <div>
                    <Label>Title</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {extractedData.title}
                      {getConfidenceBadge('title')}
                    </div>
                  </div>
                  <div>
                    <Label>First Name</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {extractedData.firstName}
                      {getConfidenceBadge('firstName')}
                    </div>
                  </div>
                  <div>
                    <Label>Middle Name</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {extractedData.middleName}
                      {getConfidenceBadge('middleName')}
                    </div>
                  </div>
                  <div>
                    <Label>Surname</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {extractedData.surname}
                      {getConfidenceBadge('surname')}
                    </div>
                  </div>
                  <div>
                    <Label>Date of Birth</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {extractedData.dateOfBirth}
                      {getConfidenceBadge('dateOfBirth')}
                    </div>
                  </div>
                  <div>
                    <Label>Occupation</Label>
                    <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                      {extractedData.occupation}
                      {getConfidenceBadge('occupation')}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Property Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Property Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cover Type</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.coverType}
                    {getConfidenceBadge('coverType')}
                  </div>
                </div>
                <div>
                  <Label>Building Sums Insured</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.buildingSumsInsured}
                    {getConfidenceBadge('buildingSumsInsured')}
                  </div>
                </div>
                <div>
                  <Label>Content Sums Insured</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.contentSumsInsured}
                    {getConfidenceBadge('contentSumsInsured')}
                  </div>
                </div>
                <div>
                  <Label>Property Type</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.propertyType}
                    {getConfidenceBadge('propertyType')}
                  </div>
                </div>
                <div>
                  <Label>Year Built</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.yearBuilt}
                    {getConfidenceBadge('yearBuilt')}
                  </div>
                </div>
                <div>
                  <Label>Number of Bedrooms</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.numberOfBedrooms}
                    {getConfidenceBadge('numberOfBedrooms')}
                  </div>
                </div>
                <div>
                  <Label>Listed Building</Label>
                  <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                    {extractedData.listedBuilding}
                    {getConfidenceBadge('listedBuilding')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}