import fs from 'fs';
import path from 'path';

export interface ReferenceData {
  ticket_key: string;
  field_name: string;
  reference_value: string;
  source_system: string;
  last_updated: string;
}

export function getReferenceDataByTicket(ticketKey: string): ReferenceData[] {
  try {
    const csvPath = path.join(process.cwd(), 'data/csv/reference-data.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    
    const referenceData: ReferenceData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const record: any = {};
      
      headers.forEach((header, index) => {
        record[header.trim()] = values[index]?.trim() || '';
      });
      
      if (record.ticket_key === ticketKey) {
        referenceData.push(record as ReferenceData);
      }
    }
    
    console.log(`[Reference Data] Found ${referenceData.length} reference records for ${ticketKey}`);
    return referenceData;
  } catch (error) {
    console.error(`[Reference Data] Error reading reference data for ${ticketKey}:`, error);
    return [];
  }
}

export function getAllReferenceData(): ReferenceData[] {
  try {
    const csvPath = path.join(process.cwd(), 'data/csv/reference-data.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',');
    
    const referenceData: ReferenceData[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const record: any = {};
      
      headers.forEach((header, index) => {
        record[header.trim()] = values[index]?.trim() || '';
      });
      
      referenceData.push(record as ReferenceData);
    }
    
    return referenceData;
  } catch (error) {
    console.error('[Reference Data] Error reading all reference data:', error);
    return [];
  }
}