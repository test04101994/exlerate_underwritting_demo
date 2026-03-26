// Direct CSV data comparison without AI processing
import { getReferenceDataByTicket } from '../shared/reference-data';

export interface FieldComparison {
  fieldName: string;
  referenceValue: string;
  approvedValue: string;
  changeStatus: 'UNCHANGED' | 'MODIFIED' | 'NEW';
  confidence: number;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ComparisonResult {
  ticketId: string;
  totalFieldsCompared: number;
  unchangedFields: number;
  modifiedFields: number;
  newFields: number;
  changesDetected: boolean;
  totalChanges: number;
  fieldComparisons: FieldComparison[];
  changesList: string[];  // Structured list for Mismatch Summary Agent
  summary: string;
}

/**
 * Compare approved data extraction with reference CSV data directly
 * No AI processing needed - pure data comparison
 */
export function compareApprovedDataWithReference(
  ticketId: string, 
  approvedData: any
): ComparisonResult {
  console.log(`[CSV Comparison] Comparing approved data for ticket ${ticketId} with reference CSV`);
  
  // Get reference data from CSV
  const referenceData = getReferenceDataByTicket(ticketId);
  
  if (!referenceData || referenceData.length === 0) {
    console.log(`[CSV Comparison] No reference data found for ticket ${ticketId}`);
    return {
      ticketId,
      totalFieldsCompared: 0,
      unchangedFields: 0,
      modifiedFields: 0,
      newFields: 0,
      changesDetected: false,
      totalChanges: 0,
      fieldComparisons: [],
      summary: `No reference data found for ticket ${ticketId}`
    };
  }

  // Convert reference data array to object for easier comparison
  const referenceMap: Record<string, string> = {};
  referenceData.forEach(ref => {
    referenceMap[ref.field_name] = ref.reference_value;
  });

  const fieldComparisons: FieldComparison[] = [];
  const changesList: string[] = [];
  let unchangedCount = 0;
  let modifiedCount = 0;
  let newCount = 0;

  // Compare each approved field with reference data
  Object.keys(approvedData).forEach(fieldName => {
    const approvedValue = String(approvedData[fieldName] || '').trim();
    const referenceValue = String(referenceMap[fieldName] || '').trim();
    
    let changeStatus: 'UNCHANGED' | 'MODIFIED' | 'NEW';
    let impact: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    
    if (!referenceValue && approvedValue) {
      changeStatus = 'NEW';
      newCount++;
      impact = 'MEDIUM';
      // Add to changes list for Mismatch Summary Agent
      changesList.push(`${fieldName}: New field added in slip with value "${approvedValue}" (not present in database)`);
    } else if (referenceValue === approvedValue) {
      changeStatus = 'UNCHANGED';
      unchangedCount++;
    } else {
      changeStatus = 'MODIFIED';
      modifiedCount++;
      
      // Determine impact based on field importance
      if (fieldName.includes('client_name') || fieldName.includes('property_value') || fieldName.includes('coverage')) {
        impact = 'HIGH';
      } else if (fieldName.includes('address') || fieldName.includes('type')) {
        impact = 'MEDIUM';
      }
      
      // Add to changes list for Mismatch Summary Agent
      changesList.push(`${fieldName}: Database value is "${referenceValue}" but slip value is "${approvedValue}"`);
    }

    fieldComparisons.push({
      fieldName,
      referenceValue: referenceValue || 'N/A',
      approvedValue: approvedValue || 'N/A',
      changeStatus,
      confidence: 1.0, // Direct data comparison has 100% confidence
      impact
    });
  });

  const totalChanges = modifiedCount + newCount;
  const changesDetected = totalChanges > 0;

  // Generate summary
  let summary = `Field Comparison Analysis - Reference Data vs Approved Data:\n\n`;
  
  fieldComparisons.forEach((comparison, index) => {
    summary += `${index + 1}. ${comparison.fieldName}:\n`;
    summary += `   - Reference Value: ${comparison.referenceValue}\n`;
    summary += `   - Approved Value: ${comparison.approvedValue}\n`;
    summary += `   - Change Status: ${comparison.changeStatus}\n`;
    summary += `   - Confidence: 100%\n`;
    summary += `   - Impact: ${comparison.impact}\n\n`;
  });

  summary += `Summary of Changes:\n`;
  summary += `- Total Fields Compared: ${fieldComparisons.length}\n`;
  summary += `- Unchanged Fields: ${unchangedCount}\n`;
  summary += `- Modified Fields: ${modifiedCount}\n`;
  summary += `- New Fields Added: ${newCount}\n\n`;
  summary += `CHANGES_DETECTED: ${changesDetected ? 'YES' : 'NO'}\n`;
  summary += `TOTAL_CHANGES: ${totalChanges}`;

  console.log(`[CSV Comparison] Results: ${totalChanges} changes detected out of ${fieldComparisons.length} fields`);

  return {
    ticketId,
    totalFieldsCompared: fieldComparisons.length,
    unchangedFields: unchangedCount,
    modifiedFields: modifiedCount,
    newFields: newCount,
    changesDetected,
    totalChanges,
    fieldComparisons,
    changesList,
    summary
  };
}