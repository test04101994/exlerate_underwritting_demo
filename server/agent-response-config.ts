import fs from 'fs';
import path from 'path';

interface AgentResponse {
  work_message: string;
  completion_message: string;
  confidence: number;
}

interface AgentResponseConfig {
  field_comparison: AgentResponse;
  sanctions_check: AgentResponse;
  mismatch_summary: AgentResponse;
  risk_assessment: AgentResponse;
  data_validation: AgentResponse;
  integration: AgentResponse;
  automated_data_validation: AgentResponse;
  video_review: AgentResponse;
  // Submission workflow agent types
  extraction?: AgentResponse;
  compliance?: AgentResponse;
  analytics?: AgentResponse;
  financial?: AgentResponse;
  communication?: AgentResponse;
}

let cachedConfig: AgentResponseConfig | null = null;

export function loadAgentResponseConfig(): AgentResponseConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const configPath = path.join(process.cwd(), 'core/config/agent-responses.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    cachedConfig = JSON.parse(configData);
    return cachedConfig!;
  } catch (error) {
    console.error('[Config Error] Failed to load agent response config:', error);
    
    // Fallback configuration if file is missing
    return {
      field_comparison: {
        work_message: "🔍 Field Comparison Agent analyzing data differences...",
        completion_message: "✅ Field Comparison Agent completed analysis. Mismatches identified in UMR and signed line fields.",
        confidence: 0.92
      },
      sanctions_check: {
        work_message: "🛡️ Sanctions Check Agent performing compliance screening...",
        completion_message: "⚠️ Sanctions Check Agent completed.\n\nSanctions Screening Result: PASSED\nEntity name not found in any compliance or regulatory databases.\n\nRisk Classification: Medium\nConfidence Level: 92%\n\n📌 Recommendation: No sanctions detected, but adverse media flagged. Escalate to Compliance before proceeding.",
        confidence: 0.92
      },
      mismatch_summary: {
        work_message: "📋 Mismatch Summary Agent generating analysis report...",
        completion_message: "✅ Mismatch Summary Agent completed. Summary ready for JIRA posting.",
        confidence: 0.95
      },
      risk_assessment: {
        work_message: "⚖️ Risk Assessment Agent evaluating risk factors...",
        completion_message: "✅ Risk Assessment Agent completed. Medium risk rating assigned.",
        confidence: 0.88
      },
      data_validation: {
        work_message: "✅ Data Validation Agent validating sanction checks and completeness...",
        completion_message: "✅ Data Validation Agent completed. Sanction check completeness: Passed. All validation steps successfully completed. Invoking Integration Agent to update Policy Administration System (PAS).",
        confidence: 0.97
      },
      integration: {
        work_message: "🔗 Integration Agent integrating workflow data with PAS...",
        completion_message: "✅ **Integration Agent Completed**\n\n**PAS Integration Summary:**\nAll data successfully processed, validated, and updated in PAS.\nFull audit trail and compliance checks logged.\n\n**Integration Details:**\n• **Data Validation**: All field values verified and standardized\n• **PAS Update Status**: Successfully synchronized with Policy Administration System\n• **Audit Trail**: Complete transaction log generated with timestamps\n• **Compliance Verification**: All regulatory requirements satisfied\n• **Data Integrity**: 100% accuracy confirmed across all systems\n\n**System Integration**: COMPLETED\n**Audit Status**: LOGGED\n**Workflow Status**: SUCCESSFULLY FINALIZED",
        confidence: 0.96
      },
      automated_data_validation: {
        work_message: "🔍 Automated Data Validation Agent performing quality checks...",
        completion_message: "✅ Automated Data Validation Agent completed. Data quality score: 95/100 - EXCELLENT. All validation checks passed.",
        confidence: 0.97
      },
      video_review: {
        work_message: "📹 **Video Review Agent - Validation Analysis**\n\nAnalyzing screen recording of data extraction review...\n\n• Loading validation session recording\n• Analyzing user interactions and data entry patterns\n• Verifying field-by-field review completeness\n• Cross-referencing extracted data with validation actions\n• Checking for approval timestamps and user confirmations\n• Processing video metadata and session markers\n\n⏳ **Video preview will be available soon...**\n\nValidation analysis in progress...",
        completion_message: "✅ **Video Review Agent - Validation Complete**\n\n**Screen Recording Analysis Summary:**\n• **Recording Duration**: 2m 34s\n• **Validation Fields Reviewed**: 12/12 (100%)\n• **User Interactions Captured**: 18 field validations\n• **Data Entry Actions**: All captured successfully\n• **Approval Timestamp**: Verified and logged\n• **Video Quality**: HD 1920x1080\n\n**Validation Recording Available:**\n\n[VIDEO:/recordings/test-recording.mp4]\n\n**Analysis Results:**\n✅ Complete validation workflow captured\n✅ All data entry actions recorded\n✅ User review process documented\n✅ Quality assurance steps verified\n\n**Status**: Video validation analysis completed - Ready for quality assurance review",
        confidence: 0.98
      }
    };
  }
}

export function getAgentResponse(agentType: string): AgentResponse | null {
  const config = loadAgentResponseConfig();
  
  // Map agent types to config keys
  const typeMapping: Record<string, keyof AgentResponseConfig> = {
    'field_comparison': 'field_comparison',
    'sanctions_check': 'sanctions_check', 
    'mismatch_summary': 'mismatch_summary',
    'risk_assessment': 'risk_assessment',
    'data_validation': 'data_validation',
    'integration': 'integration',
    'automated_data_validation': 'automated_data_validation',
    'video_review': 'video_review',
    // Submission workflow agent types
    'extraction': 'extraction',
    'compliance': 'compliance',
    'analytics': 'analytics',
    'financial': 'financial',
    'communication': 'communication'
  };

  const configKey = typeMapping[agentType];
  if (configKey && config[configKey]) {
    return config[configKey];
  }

  return null;
}

export function refreshConfigCache(): void {
  cachedConfig = null;
}