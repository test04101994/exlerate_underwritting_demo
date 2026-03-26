import fs from 'fs';
import path from 'path';

export interface SlipCsvRow {
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

let cachedSlipData: SlipCsvRow[] | null = null;

export function parseSlipCsv(): SlipCsvRow[] {
  if (cachedSlipData) {
    return cachedSlipData;
  }

  try {
    const csvPath = path.join(process.cwd(), 'data/csv', 'slip-data.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    
    const slipData: SlipCsvRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row: any = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      slipData.push(row as SlipCsvRow);
    }
    
    cachedSlipData = slipData;
    return slipData;
  } catch (error) {
    console.error('Error reading slip CSV file:', error);
    return [];
  }
}

export function getSlipById(slipId: string): SlipCsvRow | null {
  const slipData = parseSlipCsv();
  return slipData.find(slip => slip.slip_id === slipId) || null;
}

export function getAllSlips(): SlipCsvRow[] {
  return parseSlipCsv();
}

export function getSlipsByCategory(category: string): SlipCsvRow[] {
  const slipData = parseSlipCsv();
  return slipData.filter(slip => slip.risk_category.toLowerCase().includes(category.toLowerCase()));
}