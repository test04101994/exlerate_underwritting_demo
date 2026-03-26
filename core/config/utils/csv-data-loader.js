/**
 * CSV Data Loader for Data Extraction Agent
 * Handles loading and displaying CSV data in extraction forms
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class CSVDataLoader {
  constructor(configPath = './config') {
    this.configPath = configPath;
    this.csvCache = new Map();
  }

  /**
   * Load CSV data for Data Extraction Agent
   * @param {string} workflowType - 'submission' or 'slip'
   * @param {string} keyValue - submission_id or slip_reference
   * @returns {Object} Extracted data with confidence scores
   */
  async loadExtractionData(workflowType, keyValue) {
    const config = this.getDataSourceConfig(workflowType);
    if (!config) {
      throw new Error(`No data source configuration found for ${workflowType}`);
    }

    const csvData = await this.loadCSVFile(config.source);
    const record = csvData.find(row => row[config.keyField] === keyValue);
    
    if (!record) {
      throw new Error(`No record found for ${config.keyField}: ${keyValue}`);
    }

    return this.formatExtractionData(record, config);
  }

  /**
   * Get data source configuration for workflow type
   * @param {string} workflowType - 'submission' or 'slip'
   * @returns {Object} Data source configuration
   */
  getDataSourceConfig(workflowType) {
    try {
      const agentFile = path.join(this.configPath, 'agents', `${workflowType}-agents.json`);
      const agentConfig = JSON.parse(fs.readFileSync(agentFile, 'utf8'));
      
      const dataExtractionAgent = agentConfig.agents.find(agent => agent.id === 'data-extraction');
      return dataExtractionAgent ? dataExtractionAgent.dataSource : null;
    } catch (error) {
      console.error(`Failed to load data source config for ${workflowType}:`, error);
      return null;
    }
  }

  /**
   * Load CSV file data
   * @param {string} filename - CSV filename
   * @returns {Array} Array of CSV records
   */
  async loadCSVFile(filename) {
    const cacheKey = filename;
    
    if (this.csvCache.has(cacheKey)) {
      return this.csvCache.get(cacheKey);
    }

    const csvPath = path.join('./shared', filename);
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }

    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          this.csvCache.set(cacheKey, results);
          resolve(results);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  /**
   * Format CSV data for extraction form display
   * @param {Object} record - CSV record
   * @param {Object} config - Data source configuration
   * @returns {Object} Formatted extraction data
   */
  formatExtractionData(record, config) {
    const extractedData = {};
    
    for (const field of config.displayFields) {
      extractedData[field] = {
        value: record[field] || '',
        confidence: this.getConfidenceScore(field, config.confidenceScores),
        editable: true,
        required: this.isFieldRequired(field, config),
        displayName: this.getFieldDisplayName(field),
        type: this.getFieldType(field)
      };
    }

    return {
      keyField: config.keyField,
      keyValue: record[config.keyField],
      extractedData: extractedData,
      confidence: this.calculateOverallConfidence(extractedData),
      source: 'csv',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get confidence score for field
   * @param {string} field - Field name
   * @param {Object} confidenceScores - Confidence score mapping
   * @returns {string} Confidence level (high/medium/low)
   */
  getConfidenceScore(field, confidenceScores) {
    return confidenceScores[field] || 'medium';
  }

  /**
   * Check if field is required
   * @param {string} field - Field name
   * @param {Object} config - Data source configuration
   * @returns {boolean} Is field required
   */
  isFieldRequired(field, config) {
    const requiredFields = ['client_name', 'broker_name', 'policy_type', 'slip_reference', 'lloyd_syndicate'];
    return requiredFields.includes(field);
  }

  /**
   * Get display name for field
   * @param {string} field - Field name
   * @returns {string} Display name
   */
  getFieldDisplayName(field) {
    const displayNames = {
      'client_name': 'Client Name',
      'broker_name': 'Broker Name',
      'policy_type': 'Policy Type',
      'coverage_amount': 'Coverage Amount',
      'premium_amount': 'Premium Amount',
      'property_address': 'Property Address',
      'contact_phone': 'Contact Phone',
      'contact_email': 'Contact Email',
      'slip_reference': 'Slip Reference',
      'lloyd_syndicate': "Lloyd's Syndicate",
      'lead_underwriter': 'Lead Underwriter',
      'capacity_percentage': 'Capacity Percentage',
      'coverage_type': 'Coverage Type',
      'policy_limits': 'Policy Limits',
      'deductibles': 'Deductibles',
      'market_date': 'Market Date'
    };
    
    return displayNames[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Get field type for validation
   * @param {string} field - Field name
   * @returns {string} Field type
   */
  getFieldType(field) {
    const typeMapping = {
      'coverage_amount': 'currency',
      'premium_amount': 'currency',
      'policy_limits': 'currency',
      'deductibles': 'currency',
      'capacity_percentage': 'percentage',
      'contact_phone': 'phone',
      'contact_email': 'email',
      'market_date': 'date'
    };
    
    return typeMapping[field] || 'text';
  }

  /**
   * Calculate overall confidence score
   * @param {Object} extractedData - Extracted data with confidence scores
   * @returns {number} Overall confidence percentage
   */
  calculateOverallConfidence(extractedData) {
    const confidenceValues = {
      'high': 95,
      'medium': 80,
      'low': 65
    };
    
    const scores = Object.values(extractedData)
      .map(field => confidenceValues[field.confidence] || 80);
    
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  /**
   * Get available submission IDs from CSV
   * @returns {Array} Array of submission IDs
   */
  async getAvailableSubmissionIds() {
    try {
      const csvData = await this.loadCSVFile('submissions.csv');
      return csvData.map(row => row.submission_id).filter(id => id);
    } catch (error) {
      console.error('Failed to get submission IDs:', error);
      return [];
    }
  }

  /**
   * Get available slip references from CSV
   * @returns {Array} Array of slip references
   */
  async getAvailableSlipReferences() {
    try {
      const csvData = await this.loadCSVFile('slip-data.csv');
      return csvData.map(row => row.slip_reference).filter(ref => ref);
    } catch (error) {
      console.error('Failed to get slip references:', error);
      return [];
    }
  }

  /**
   * Clear CSV cache
   */
  clearCache() {
    this.csvCache.clear();
  }
}

// Usage Examples:
/*
const csvLoader = new CSVDataLoader('./config');

// Load submission data
const submissionData = await csvLoader.loadExtractionData('submission', 'UW-2025-001');

// Load slip data
const slipData = await csvLoader.loadExtractionData('slip', 'SLP-2025-001');

// Format for form display
const formData = {
  extractedData: submissionData.extractedData,
  confidence: submissionData.confidence,
  source: 'CSV File',
  editable: true
};
*/

module.exports = { CSVDataLoader };