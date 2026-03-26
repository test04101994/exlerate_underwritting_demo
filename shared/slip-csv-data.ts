import fs from 'fs';
import path from 'path';

// CSV Data Lookup Utility - SLIP DATA ONLY (not submissions)
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
  created_at: string;
  updated_at: string;
  email_subject: string;
}

// Function to parse CSV line handling quoted fields and commas
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Function to read CSV data dynamically
function readSlipCsvData(): CsvSlipData[] {
  try {
    const csvPath = path.join(process.cwd(), 'data/csv/slip-data.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    const headers = parseCsvLine(lines[0]);
    
    return lines.slice(1).map(line => {
      const values = parseCsvLine(line);
      const record: any = {};
      
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      
      return record as CsvSlipData;
    });
  } catch (error) {
    console.error('Error reading slip CSV data:', error);
    return [];
  }
}

// Cache for CSV data to avoid reading file on every request
let csvDataCache: CsvSlipData[] | null = null;
let lastReadTime = 0;
const CACHE_DURATION = 5000; // 5 seconds cache

function getSlipCsvData(): CsvSlipData[] {
  const now = Date.now();
  
  // Return cached data if it's still fresh
  if (csvDataCache && (now - lastReadTime) < CACHE_DURATION) {
    return csvDataCache;
  }
  
  // Read fresh data from CSV file
  csvDataCache = readSlipCsvData();
  lastReadTime = now;
  
  return csvDataCache;
}



export function getSlipDataById(slipId: string): CsvSlipData | null {
  const csvData = getSlipCsvData();
  return csvData.find(slip => slip.slip_id === slipId) || null;
}

export function getAvailableSlipIds(): string[] {
  const csvData = getSlipCsvData();
  return csvData.map(slip => slip.slip_id);
}

export function getSlipDataByToken(token: string): CsvSlipData | null {
  const csvData = getSlipCsvData();
  return csvData.find(slip => slip.token === token) || null;
}

export function getSlipDataByReference(reference: string): CsvSlipData | null {
  const csvData = getSlipCsvData();
  return csvData.find(slip => slip.slip_reference === reference) || null;
}