// Multi-Property CSV Data Structure for UW-2025-003
export interface MultiPropertyCsvData {
  submission_id: string;
  token: string;
  broker_ref_hu_number: string;
  intermediary_name: string;
  broker_contact_name: string;
  broker_email: string;
  target_premium: string;
  quote_effective_date: string;
  previous_insurer: string;
  insurance_declined: string;
  convictions: string;
  bankruptcy: string;
  claims_count: string;
  contact_role: string;
  title: string;
  first_name: string;
  middle_name: string;
  surname: string;
  date_of_birth: string;
  occupation: string;
  house_number: string;
  house_name: string;
  address_line1: string;
  city: string;
  postcode: string;
  
  // Property 1 Details
  property1_house_number: string;
  property1_house_name: string;
  property1_address_line1: string;
  property1_city: string;
  property1_postcode: string;
  property1_type: string;
  property1_value: string;
  property1_bedrooms: string;
  property1_bathrooms: string;
  property1_year_built: string;
  property1_construction_type: string;
  property1_roof_type: string;
  property1_security_features: string;
  property1_building_sums_insured: string;
  property1_content_sums_insured: string;
  property1_jewellery_value: string;
  property1_art_collections_value: string;
  property1_solely_occupied: string;
  property1_property_ownership: string;
  property1_listed_building: string;
  
  // Property 2 Details
  property2_house_number: string;
  property2_house_name: string;
  property2_address_line1: string;
  property2_city: string;
  property2_postcode: string;
  property2_type: string;
  property2_value: string;
  property2_bedrooms: string;
  property2_bathrooms: string;
  property2_year_built: string;
  property2_construction_type: string;
  property2_roof_type: string;
  property2_security_features: string;
  property2_building_sums_insured: string;
  property2_content_sums_insured: string;
  property2_jewellery_value: string;
  property2_art_collections_value: string;
  property2_solely_occupied: string;
  property2_property_ownership: string;
  property2_listed_building: string;
  
  // Summary Information
  total_property_value: string;
  total_building_sums_insured: string;
  total_content_sums_insured: string;
  total_jewellery_value: string;
  total_art_collections_value: string;
  policy_type: string;
  cover_type: string;
  
  // Metadata
  created_at: string;
  updated_at: string;
  email_subject: string;
}

export const multiPropertyCsvData: MultiPropertyCsvData[] = [
  {
    submission_id: "UW-2025-003",
    token: "token-multi-prop-001",
    broker_ref_hu_number: "REF-HU-2024003",
    intermediary_name: "Willis Towers Watson",
    broker_contact_name: "Emma Wilson",
    broker_email: "emma.wilson@willistowerswatson.com",
    target_premium: "£15750",
    quote_effective_date: "7/25/24",
    previous_insurer: "Direct Line",
    insurance_declined: "No",
    convictions: "No",
    bankruptcy: "No",
    claims_count: "2",
    contact_role: "Main Policy Holder",
    title: "Mrs",
    first_name: "Emma",
    middle_name: "Louise",
    surname: "Wilson",
    date_of_birth: "7/14/90",
    occupation: "Account Manager",
    house_number: "156",
    house_name: "The Gables",
    address_line1: "Park Avenue",
    city: "Birmingham",
    postcode: "B15 2TH",
    
    // Property 1 Details - Primary Residence
    property1_house_number: "156",
    property1_house_name: "The Gables",
    property1_address_line1: "Park Avenue",
    property1_city: "Birmingham",
    property1_postcode: "B15 2TH",
    property1_type: "House - Detached",
    property1_value: "£850000",
    property1_bedrooms: "4",
    property1_bathrooms: "3",
    property1_year_built: "1985",
    property1_construction_type: "Brick",
    property1_roof_type: "Tiles",
    property1_security_features: "Alarm System, CCTV, Motion Sensors",
    property1_building_sums_insured: "£650000",
    property1_content_sums_insured: "£125000",
    property1_jewellery_value: "£45000",
    property1_art_collections_value: "£30000",
    property1_solely_occupied: "Yes",
    property1_property_ownership: "Owner Occupied",
    property1_listed_building: "No",
    
    // Property 2 Details - Holiday Home
    property2_house_number: "42",
    property2_house_name: "Seaside Cottage",
    property2_address_line1: "Coastal Road",
    property2_city: "Brighton",
    property2_postcode: "BN1 3AN",
    property2_type: "House - Terraced",
    property2_value: "£725000",
    property2_bedrooms: "3",
    property2_bathrooms: "2",
    property2_year_built: "1920",
    property2_construction_type: "Stone",
    property2_roof_type: "Slate",
    property2_security_features: "Smart Door Locks, Window Sensors",
    property2_building_sums_insured: "£550000",
    property2_content_sums_insured: "£85000",
    property2_jewellery_value: "£20000",
    property2_art_collections_value: "£15000",
    property2_solely_occupied: "No",
    property2_property_ownership: "Owner Occupied",
    property2_listed_building: "Grade II Listed",
    
    // Summary Information
    total_property_value: "£1575000",
    total_building_sums_insured: "£1200000",
    total_content_sums_insured: "£210000",
    total_jewellery_value: "£65000",
    total_art_collections_value: "£45000",
    policy_type: "Multi-Property Home Insurance",
    cover_type: "Combined",
    
    // Metadata
    created_at: "2024-07-10T11:45:00",
    updated_at: "2024-07-10T11:45:00",
    email_subject: "RE: Multi-Property Home Insurance Quote - Emma Wilson, The Gables & Seaside Cottage"
  },
  {
    submission_id: "UW-2025-004",
    token: "token-multi-prop-002",
    broker_ref_hu_number: "REF-HU-2024004",
    intermediary_name: "Marsh UK Limited",
    broker_contact_name: "James Potter",
    broker_email: "james.potter@marsh.com",
    target_premium: "£22500",
    quote_effective_date: "8/1/24",
    previous_insurer: "Aviva Insurance",
    insurance_declined: "No",
    convictions: "No",
    bankruptcy: "No",
    claims_count: "0",
    contact_role: "Main Policy Holder",
    title: "Mr",
    first_name: "James",
    middle_name: "Robert",
    surname: "Potter",
    date_of_birth: "3/15/82",
    occupation: "Investment Banker",
    house_number: "88",
    house_name: "Kensington Manor",
    address_line1: "Kensington High Street",
    city: "London",
    postcode: "W8 4SG",
    
    // Property 1 Details - London Residence
    property1_house_number: "88",
    property1_house_name: "Kensington Manor",
    property1_address_line1: "Kensington High Street",
    property1_city: "London",
    property1_postcode: "W8 4SG",
    property1_type: "House - Detached",
    property1_value: "£2850000",
    property1_bedrooms: "6",
    property1_bathrooms: "5",
    property1_year_built: "1890",
    property1_construction_type: "Victorian Brick",
    property1_roof_type: "Slate",
    property1_security_features: "24/7 Security System, CCTV, Panic Room",
    property1_building_sums_insured: "£2200000",
    property1_content_sums_insured: "£450000",
    property1_jewellery_value: "£250000",
    property1_art_collections_value: "£180000",
    property1_solely_occupied: "Yes",
    property1_property_ownership: "Owner Occupied",
    property1_listed_building: "Grade I Listed",
    
    // Property 2 Details - Country Estate
    property2_house_number: "1",
    property2_house_name: "Cotswold Estate",
    property2_address_line1: "Manor Lane",
    property2_city: "Chipping Norton",
    property2_postcode: "OX7 5LH",
    property2_type: "House - Detached",
    property2_value: "£1950000",
    property2_bedrooms: "8",
    property2_bathrooms: "6",
    property2_year_built: "1750",
    property2_construction_type: "Cotswold Stone",
    property2_roof_type: "Slate",
    property2_security_features: "Perimeter Security, CCTV, Groundskeeper",
    property2_building_sums_insured: "£1500000",
    property2_content_sums_insured: "£300000",
    property2_jewellery_value: "£150000",
    property2_art_collections_value: "£220000",
    property2_solely_occupied: "No",
    property2_property_ownership: "Owner Occupied",
    property2_listed_building: "Grade II* Listed",
    
    // Summary Information
    total_property_value: "£4800000",
    total_building_sums_insured: "£3700000",
    total_content_sums_insured: "£750000",
    total_jewellery_value: "£400000",
    total_art_collections_value: "£400000",
    policy_type: "Multi-Property Premium Home Insurance",
    cover_type: "Combined",
    
    // Metadata
    created_at: "2024-07-10T14:20:00",
    updated_at: "2024-07-10T14:20:00",
    email_subject: "RE: Premium Multi-Property Insurance Quote - James Potter, Kensington Manor & Cotswold Estate"
  }
];

// Utility function to get multi-property data by submission ID
export function getMultiPropertyDataBySubmissionId(submissionId: string): MultiPropertyCsvData | null {
  return multiPropertyCsvData.find(data => data.submission_id === submissionId) || null;
}

// Utility function to get all multi-property submission IDs
export function getMultiPropertySubmissionIds(): string[] {
  return multiPropertyCsvData.map(data => data.submission_id);
}

// Utility function to check if a submission has multiple properties
export function hasMultipleProperties(submissionId: string): boolean {
  const data = getMultiPropertyDataBySubmissionId(submissionId);
  return data ? (data.property2_address_line1 !== "" && data.property2_address_line1 !== null) : false;
}

// Utility function to get property count
export function getPropertyCount(submissionId: string): number {
  const data = getMultiPropertyDataBySubmissionId(submissionId);
  if (!data) return 0;
  
  let count = 0;
  if (data.property1_address_line1) count++;
  if (data.property2_address_line1) count++;
  
  return count;
}