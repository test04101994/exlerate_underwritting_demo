// Simple implementation without CSV parsing to avoid import issues
export interface JiraDataExtraction {
  ticket_key: string;
  extracted_field: string;
  field_value: string;
  confidence_score: number;
  source_document: string;
}

const mockDataExtraction: Record<string, JiraDataExtraction[]> = {
  "HIS-90": [
    { ticket_key: "HIS-90", extracted_field: "client_name", field_value: "Maritime Logistics Ltd", confidence_score: 0.95, source_document: "email_attachment.pdf" },
    { ticket_key: "HIS-90", extracted_field: "policy_type", field_value: "Marine Cargo Insurance", confidence_score: 0.92, source_document: "application_form.pdf" },
    { ticket_key: "HIS-90", extracted_field: "coverage_amount", field_value: "£750,000", confidence_score: 0.88, source_document: "financial_statements.pdf" },
    { ticket_key: "HIS-90", extracted_field: "vessel_name", field_value: "MV Ocean Carrier", confidence_score: 0.94, source_document: "bill_of_lading.pdf" },
    { ticket_key: "HIS-90", extracted_field: "cargo_description", field_value: "Electronics and Computer Equipment", confidence_score: 0.91, source_document: "cargo_manifest.pdf" },
    { ticket_key: "HIS-90", extracted_field: "voyage_route", field_value: "Southampton to Hamburg", confidence_score: 0.89, source_document: "voyage_schedule.pdf" },
    { ticket_key: "HIS-90", extracted_field: "departure_date", field_value: "2025-08-15", confidence_score: 0.93, source_document: "shipping_documents.pdf" },
    { ticket_key: "HIS-90", extracted_field: "broker_name", field_value: "Peters Charley", confidence_score: 0.96, source_document: "broker_correspondence.pdf" },
    { ticket_key: "HIS-90", extracted_field: "broker_email", field_value: "james_potter1@ajg.com", confidence_score: 0.97, source_document: "contact_details.pdf" },
    { ticket_key: "HIS-90", extracted_field: "premium_estimate", field_value: "£8,250", confidence_score: 0.85, source_document: "quote_request.pdf" },
    { ticket_key: "HIS-90", extracted_field: "risk_factors", field_value: "High-value cargo, international waters", confidence_score: 0.78, source_document: "risk_assessment.pdf" },
    { ticket_key: "HIS-90", extracted_field: "previous_claims", field_value: "None in last 3 years", confidence_score: 0.92, source_document: "claims_history.pdf" }
  ],
  "HIS-88": [
    { ticket_key: "HIS-88", extracted_field: "client_name", field_value: "Oceanview Properties Ltd", confidence_score: 0.94, source_document: "property_application.pdf" },
    { ticket_key: "HIS-88", extracted_field: "property_type", field_value: "Commercial Warehouse", confidence_score: 0.91, source_document: "building_survey.pdf" },
    { ticket_key: "HIS-88", extracted_field: "property_value", field_value: "£2,450,000", confidence_score: 0.89, source_document: "valuation_report.pdf" },
    { ticket_key: "HIS-88", extracted_field: "location_address", field_value: "45 Industrial Estate, Portsmouth PO1 2AB", confidence_score: 0.93, source_document: "property_details.pdf" },
    { ticket_key: "HIS-88", extracted_field: "construction_type", field_value: "Steel frame with concrete panels", confidence_score: 0.87, source_document: "structural_report.pdf" },
    { ticket_key: "HIS-88", extracted_field: "occupancy_type", field_value: "Storage and Distribution", confidence_score: 0.92, source_document: "business_operations.pdf" }
  ],
  "HIS-87": [
    { ticket_key: "HIS-87", extracted_field: "slip_reference", field_value: "SLP-2025-001", confidence_score: 0.96, source_document: "lloyd_slip.pdf" },
    { ticket_key: "HIS-87", extracted_field: "syndicate_number", field_value: "2987", confidence_score: 0.94, source_document: "syndicate_details.pdf" },
    { ticket_key: "HIS-87", extracted_field: "lead_underwriter", field_value: "Thompson Marine Underwriters", confidence_score: 0.92, source_document: "underwriter_info.pdf" },
    { ticket_key: "HIS-87", extracted_field: "coverage_type", field_value: "Hull and Machinery", confidence_score: 0.93, source_document: "policy_schedule.pdf" },
    { ticket_key: "HIS-87", extracted_field: "insured_vessel", field_value: "MV Atlantic Pioneer", confidence_score: 0.95, source_document: "vessel_documentation.pdf" },
    { ticket_key: "HIS-87", extracted_field: "vessel_value", field_value: "£15,500,000", confidence_score: 0.91, source_document: "marine_survey.pdf" }
  ]
};

export function getJiraDataExtraction(ticketKey: string): JiraDataExtraction[] {
  return mockDataExtraction[ticketKey] || [];
}

export function getExtractedFieldValue(ticketKey: string, fieldName: string): string {
  const data = getJiraDataExtraction(ticketKey);
  const field = data.find(record => record.extracted_field === fieldName);
  return field?.field_value || 'Not found';
}

export function getFieldConfidence(ticketKey: string, fieldName: string): number {
  const data = getJiraDataExtraction(ticketKey);
  const field = data.find(record => record.extracted_field === fieldName);
  return field?.confidence_score || 0;
}

export function getConfidenceBadgeColor(confidence: number): string {
  if (confidence >= 0.9) return 'bg-green-100 text-green-800';
  if (confidence >= 0.8) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High';
  if (confidence >= 0.8) return 'Medium';
  return 'Low';
}