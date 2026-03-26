// Workflow logic helpers for conditional agent execution

export function shouldSkipMismatchSummary(fieldComparisonResults: any): boolean {
  if (!fieldComparisonResults || !fieldComparisonResults.ai_response) {
    return false;
  }
  
  const response = fieldComparisonResults.ai_response;
  
  // Check for CHANGES_DETECTED: NO pattern
  const changesDetectedMatch = response.match(/CHANGES_DETECTED:\s*(YES|NO)/i);
  if (changesDetectedMatch && changesDetectedMatch[1].toUpperCase() === 'NO') {
    console.log('[Conditional Logic] No changes detected - skipping Mismatch Summary Agent');
    return true;
  }
  
  // Check for TOTAL_CHANGES: 0 pattern
  const totalChangesMatch = response.match(/TOTAL_CHANGES:\s*(\d+)/i);
  if (totalChangesMatch && parseInt(totalChangesMatch[1]) === 0) {
    console.log('[Conditional Logic] Zero changes detected - skipping Mismatch Summary Agent');
    return true;
  }
  
  // Check for all fields marked as UNCHANGED
  const unchangedCount = (response.match(/Change Status:\s*UNCHANGED/gi) || []).length;
  const modifiedCount = (response.match(/Change Status:\s*(MODIFIED|NEW)/gi) || []).length;
  
  if (unchangedCount > 0 && modifiedCount === 0) {
    console.log(`[Conditional Logic] All ${unchangedCount} fields unchanged - skipping Mismatch Summary Agent`);
    return true;
  }
  
  console.log('[Conditional Logic] Changes detected - proceeding to Mismatch Summary Agent');
  return false;
}

export function getNextAgentAfterFieldComparison(agents: any[], currentIndex: number, fieldComparisonResults: any): number {
  const shouldSkip = shouldSkipMismatchSummary(fieldComparisonResults);
  
  if (shouldSkip) {
    // Skip Mismatch Summary Agent (currentIndex + 1) and go to next agent
    const mismatchSummaryIndex = currentIndex + 1;
    const nextIndex = mismatchSummaryIndex + 1;
    
    console.log(`[Skip Logic] Skipping agent at index ${mismatchSummaryIndex}, moving to index ${nextIndex}`);
    
    if (nextIndex < agents.length) {
      const nextAgent = agents[nextIndex];
      console.log(`[Skip Logic] Next agent: ${nextAgent.name} (${nextAgent.type})`);
      return nextIndex;
    }
  }
  
  // Normal progression - go to next agent (Mismatch Summary)
  return currentIndex + 1;
}