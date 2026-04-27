// Claim Data Lookup Utility — sample claims data (parallels csv-data.ts for submissions)
export interface CsvClaimData {
  claim_id: string;
  claim_number: string;
  policy_number: string;
  claim_type: string;
  date_of_loss: string;
  date_reported: string;
  claim_status: string;
  claimant_role: string;
  claimant_title: string;
  claimant_first_name: string;
  claimant_surname: string;
  claimant_email: string;
  claimant_phone: string;
  policyholder_name: string;
  property_house_number: string;
  property_address_line1: string;
  property_city: string;
  property_postcode: string;
  loss_location: string;
  loss_description: string;
  loss_amount: string;
  reserve_amount: string;
  paid_amount: string;
  deductible: string;
  coverage_type: string;
  fault_party: string;
  third_party_involved: string;
  police_report_number: string;
  witness_count: string;
  photo_evidence_count: string;
  supporting_docs_count: string;
  suspected_fraud: string;
  prior_claims_count: string;
  adjuster_name: string;
  adjuster_email: string;
  broker_ref: string;
  broker_contact_name: string;
  broker_email: string;
  intermediary_name: string;
  created_at: string;
  updated_at: string;
  email_subject: string;
}

export const csvClaimData: CsvClaimData[] = [
  {
    claim_id: "CLM-2025-001",
    claim_number: "CN-2025-487102",
    policy_number: "HO-2024-7731845-CA",
    claim_type: "Water Damage",
    date_of_loss: "2025-02-14",
    date_reported: "2025-02-15",
    claim_status: "Investigating",
    claimant_role: "Main Policy Holder",
    claimant_title: "Ms",
    claimant_first_name: "Lee",
    claimant_surname: "Jones",
    claimant_email: "lee.jones@example.com",
    claimant_phone: "+44 7700 900111",
    policyholder_name: "Lee Warner Jones",
    property_house_number: "122",
    property_address_line1: "Victoria Street",
    property_city: "Princess Road",
    property_postcode: "CW5 8JE",
    loss_location: "Master bathroom — second floor",
    loss_description: "Burst pipe behind shower wall caused water to flood through ceiling into kitchen below. Damage to flooring, ceiling, and electrical fittings.",
    loss_amount: "£18,500",
    reserve_amount: "£20,000",
    paid_amount: "£0",
    deductible: "£500",
    coverage_type: "Buildings & Contents",
    fault_party: "None — sudden plumbing failure",
    third_party_involved: "No",
    police_report_number: "",
    witness_count: "1",
    photo_evidence_count: "12",
    supporting_docs_count: "4",
    suspected_fraud: "No",
    prior_claims_count: "1",
    adjuster_name: "Michael Brown",
    adjuster_email: "m.brown@adjusters.co.uk",
    broker_ref: "REF-HU-2024001",
    broker_contact_name: "Peters Charley",
    broker_email: "james_potter1@ajg.com",
    intermediary_name: "Arthur J Gallagher (UK) Ltd",
    created_at: "2025-02-15T09:30:00",
    updated_at: "2025-02-18T14:20:00",
    email_subject: "Claim Notification — Water Damage at 122 Victoria Street, Policy HO-2024-7731845-CA"
  },
  {
    claim_id: "CLM-2025-002",
    claim_number: "CN-2025-487205",
    policy_number: "HO-2024-7731902-CA",
    claim_type: "Theft",
    date_of_loss: "2025-03-02",
    date_reported: "2025-03-02",
    claim_status: "Open",
    claimant_role: "Main Policy Holder",
    claimant_title: "Mr",
    claimant_first_name: "Michael",
    claimant_surname: "Thompson",
    claimant_email: "m.thompson@example.com",
    claimant_phone: "+44 7700 900222",
    policyholder_name: "Michael James Thompson",
    property_house_number: "78",
    property_address_line1: "Regent Street",
    property_city: "London",
    property_postcode: "W1B 5RL",
    loss_location: "Ground floor study and master bedroom",
    loss_description: "Forced entry through rear French doors. Stolen items include vintage Rolex collection, jewellery, laptop, and cash.",
    loss_amount: "£62,400",
    reserve_amount: "£65,000",
    paid_amount: "£0",
    deductible: "£1,000",
    coverage_type: "Contents — High Value",
    fault_party: "Unknown burglar(s)",
    third_party_involved: "Yes — Police investigation",
    police_report_number: "MET-2025-08812",
    witness_count: "0",
    photo_evidence_count: "24",
    supporting_docs_count: "8",
    suspected_fraud: "No",
    prior_claims_count: "0",
    adjuster_name: "Rachel Green",
    adjuster_email: "r.green@adjusters.co.uk",
    broker_ref: "REF-HU-2024002",
    broker_contact_name: "Michael Thompson",
    broker_email: "m.thompson@aon.com",
    intermediary_name: "Aon UK Limited",
    created_at: "2025-03-02T18:45:00",
    updated_at: "2025-03-04T10:15:00",
    email_subject: "URGENT — Theft Claim Notification, Policy HO-2024-7731902-CA, 78 Regent Street"
  },
  {
    claim_id: "CLM-2025-003",
    claim_number: "CN-2025-487318",
    policy_number: "HO-2024-7731988-CA",
    claim_type: "Fire",
    date_of_loss: "2025-03-18",
    date_reported: "2025-03-18",
    claim_status: "Approved",
    claimant_role: "Main Policy Holder",
    claimant_title: "Mrs",
    claimant_first_name: "Emma",
    claimant_surname: "Wilson",
    claimant_email: "emma.wilson@example.com",
    claimant_phone: "+44 7700 900333",
    policyholder_name: "Emma Louise Wilson",
    property_house_number: "156",
    property_address_line1: "Park Avenue",
    property_city: "Birmingham",
    property_postcode: "B15 2TH",
    loss_location: "Kitchen and adjoining utility room",
    loss_description: "Electrical fault in dishwasher caused fire. Smoke and water damage throughout ground floor. Family safe; no injuries.",
    loss_amount: "£42,750",
    reserve_amount: "£45,000",
    paid_amount: "£42,750",
    deductible: "£500",
    coverage_type: "Buildings & Contents",
    fault_party: "Manufacturing defect — appliance",
    third_party_involved: "Yes — subrogation against manufacturer",
    police_report_number: "",
    witness_count: "3",
    photo_evidence_count: "36",
    supporting_docs_count: "12",
    suspected_fraud: "No",
    prior_claims_count: "2",
    adjuster_name: "David Lee",
    adjuster_email: "d.lee@adjusters.co.uk",
    broker_ref: "REF-HU-2024003",
    broker_contact_name: "Emma Wilson",
    broker_email: "emma.wilson@willistowerswatson.com",
    intermediary_name: "Willis Towers Watson",
    created_at: "2025-03-18T11:20:00",
    updated_at: "2025-04-02T16:00:00",
    email_subject: "Fire Claim Settlement — Policy HO-2024-7731988-CA, 156 Park Avenue Birmingham"
  },
  {
    claim_id: "CLM-2025-004",
    claim_number: "CN-2025-487401",
    policy_number: "HO-2024-7732041-CA",
    claim_type: "Storm Damage",
    date_of_loss: "2025-01-29",
    date_reported: "2025-01-30",
    claim_status: "Paid",
    claimant_role: "Main Policy Holder",
    claimant_title: "Mr",
    claimant_first_name: "David",
    claimant_surname: "Brown",
    claimant_email: "david.brown@example.com",
    claimant_phone: "+44 7700 900444",
    policyholder_name: "David Robert Brown",
    property_house_number: "23",
    property_address_line1: "High Street",
    property_city: "Leeds",
    property_postcode: "LS1 6ED",
    loss_location: "Roof and conservatory",
    loss_description: "Storm Isha tore tiles from main roof and shattered conservatory glass roof. Water ingress to two upstairs bedrooms.",
    loss_amount: "£11,250",
    reserve_amount: "£12,000",
    paid_amount: "£11,250",
    deductible: "£500",
    coverage_type: "Buildings",
    fault_party: "Weather event — storm",
    third_party_involved: "No",
    police_report_number: "",
    witness_count: "0",
    photo_evidence_count: "18",
    supporting_docs_count: "6",
    suspected_fraud: "No",
    prior_claims_count: "0",
    adjuster_name: "Sarah Mitchell",
    adjuster_email: "s.mitchell@adjusters.co.uk",
    broker_ref: "REF-HU-2024004",
    broker_contact_name: "David Brown",
    broker_email: "d.brown@ajg.com",
    intermediary_name: "Gallagher UK",
    created_at: "2025-01-30T08:10:00",
    updated_at: "2025-02-12T15:30:00",
    email_subject: "Storm Damage Claim Settled — Policy HO-2024-7732041-CA, 23 High Street Leeds"
  },
  {
    claim_id: "CLM-2025-005",
    claim_number: "CN-2025-487533",
    policy_number: "HO-2024-7732188-CA",
    claim_type: "Liability",
    date_of_loss: "2025-04-05",
    date_reported: "2025-04-06",
    claim_status: "Open",
    claimant_role: "Third Party",
    claimant_title: "Dr",
    claimant_first_name: "Rachel",
    claimant_surname: "Green",
    claimant_email: "rachel.green@example.com",
    claimant_phone: "+44 7700 900555",
    policyholder_name: "Sophie Grace Davis",
    property_house_number: "67",
    property_address_line1: "Village Green",
    property_city: "Cotswolds",
    property_postcode: "GL54 1HN",
    loss_location: "Front driveway",
    loss_description: "Visiting third party slipped on icy driveway and sustained wrist fracture. Personal injury claim against householder liability cover.",
    loss_amount: "£8,900",
    reserve_amount: "£15,000",
    paid_amount: "£0",
    deductible: "£250",
    coverage_type: "Personal Liability",
    fault_party: "Householder — failure to grit",
    third_party_involved: "Yes — claimant is third party",
    police_report_number: "",
    witness_count: "2",
    photo_evidence_count: "8",
    supporting_docs_count: "5",
    suspected_fraud: "No",
    prior_claims_count: "1",
    adjuster_name: "Tom Wilson",
    adjuster_email: "t.wilson@adjusters.co.uk",
    broker_ref: "REF-HU-2024007",
    broker_contact_name: "Sophie Davis",
    broker_email: "s.davis@lockton.com",
    intermediary_name: "Lockton Companies",
    created_at: "2025-04-06T14:00:00",
    updated_at: "2025-04-08T09:45:00",
    email_subject: "Third-Party Liability Claim — Policy HO-2024-7732188-CA, 67 Village Green Cotswolds"
  }
];

export function getClaimDataById(claimId: string): CsvClaimData | null {
  return csvClaimData.find(data => data.claim_id === claimId) || null;
}

export function getAvailableClaimIds(): string[] {
  return csvClaimData.map(data => data.claim_id);
}
