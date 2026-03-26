export interface SlipData {
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
  created_at: string;
  updated_at: string;
  email_subject: string;
}

export const slipData: SlipData[] = [
  {
    slip_id: "SLP-2025-001",
    token: "slip_token_001",
    slip_reference: "LMX/2025/001",
    lloyd_syndicate: "Syndicate 623",
    lead_underwriter: "James Mitchell",
    underwriter_email: "j.mitchell@lloyds.com",
    risk_category: "Marine Cargo",
    policy_inception_date: "01/04/2025",
    policy_expiry_date: "31/03/2026",
    coverage_territory: "Worldwide",
    currency: "USD",
    policy_limits: "$50,000,000",
    deductible: "$25,000",
    premium_amount: "$485,000",
    brokerage_rate: "15%",
    total_sum_insured: "$50,000,000",
    risk_location: "International Shipping Routes",
    business_description: "Global shipping and logistics operations",
    years_trading: "25",
    annual_turnover: "$125,000,000",
    number_of_employees: "450",
    previous_claims: "3 claims in last 5 years",
    risk_improvements: "Enhanced GPS tracking, improved packaging protocols",
    security_measures: "24/7 monitoring, secure warehousing facilities",
    compliance_certifications: "ISO 9001, IMO compliance",
    financial_rating: "A+ (Standard & Poor's)",
    reinsurance_arrangements: "75% quota share with Munich Re",
    exclusions: "War risks, nuclear perils, cyber attacks",
    warranties: "Proper packaging, approved routes only",
    conditions: "Monthly reporting, claims handling procedures",
    created_at: "2025-01-10T08:30:00Z",
    updated_at: "2025-01-10T08:30:00Z",
    email_subject: "Marine Cargo Slip - Global Shipping Ltd"
  },
  {
    slip_id: "SLP-2025-002",
    token: "slip_token_002",
    slip_reference: "LMX/2025/002",
    lloyd_syndicate: "Syndicate 435",
    lead_underwriter: "Sarah Thompson",
    underwriter_email: "s.thompson@lloyds.com",
    risk_category: "Aviation",
    policy_inception_date: "15/02/2025",
    policy_expiry_date: "14/02/2026",
    coverage_territory: "Worldwide excluding USA/Canada",
    currency: "GBP",
    policy_limits: "£25,000,000",
    deductible: "£50,000",
    premium_amount: "£320,000",
    brokerage_rate: "12.5%",
    total_sum_insured: "£25,000,000",
    risk_location: "European Airports",
    business_description: "Regional airline operations",
    years_trading: "18",
    annual_turnover: "£85,000,000",
    number_of_employees: "280",
    previous_claims: "1 claim in last 5 years",
    risk_improvements: "Updated maintenance protocols, new pilot training",
    security_measures: "Enhanced security screening, maintenance tracking",
    compliance_certifications: "EASA certification, ICAO compliance",
    financial_rating: "A- (Moody's)",
    reinsurance_arrangements: "50% quota share with Swiss Re",
    exclusions: "Acts of war, terrorist acts, hijacking",
    warranties: "Regular maintenance, certified pilots only",
    conditions: "Quarterly safety reports, incident notification",
    created_at: "2025-01-12T14:15:00Z",
    updated_at: "2025-01-12T14:15:00Z",
    email_subject: "Aviation Slip - European Regional Airways"
  },
  {
    slip_id: "SLP-2025-003",
    token: "slip_token_003",
    slip_reference: "LMX/2025/003",
    lloyd_syndicate: "Syndicate 318",
    lead_underwriter: "David Chen",
    underwriter_email: "d.chen@lloyds.com",
    risk_category: "Energy",
    policy_inception_date: "01/03/2025",
    policy_expiry_date: "28/02/2026",
    coverage_territory: "North Sea Operations",
    currency: "USD",
    policy_limits: "$100,000,000",
    deductible: "$500,000",
    premium_amount: "$1,250,000",
    brokerage_rate: "10%",
    total_sum_insured: "$100,000,000",
    risk_location: "Offshore Platform - North Sea",
    business_description: "Oil and gas extraction operations",
    years_trading: "35",
    annual_turnover: "$850,000,000",
    number_of_employees: "1,200",
    previous_claims: "2 claims in last 5 years",
    risk_improvements: "Upgraded safety systems, enhanced monitoring",
    security_measures: "24/7 platform security, restricted access",
    compliance_certifications: "HSE compliance, ISO 14001",
    financial_rating: "AA- (Fitch)",
    reinsurance_arrangements: "80% quota share with Lloyd's pool",
    exclusions: "Political risks, environmental cleanup beyond policy limits",
    warranties: "Regular safety inspections, certified personnel",
    conditions: "Monthly safety reports, immediate incident notification",
    created_at: "2025-01-15T09:45:00Z",
    updated_at: "2025-01-15T09:45:00Z",
    email_subject: "Energy Slip - North Sea Operations Ltd"
  }
];

export function getSlipDataById(slipId: string): SlipData | null {
  return slipData.find(slip => slip.slip_id === slipId) || null;
}

export function getAvailableSlipIds(): string[] {
  return slipData.map(slip => slip.slip_id);
}

export function getSlipDataByToken(token: string): SlipData | null {
  return slipData.find(slip => slip.token === token) || null;
}