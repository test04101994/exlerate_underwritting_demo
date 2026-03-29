/**
 * Custom hook for managing configurable forms with CSV data integration
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FormConfig, CsvDataSource } from '@shared/configurable-forms';

// CSV Data Source implementations
export class SubmissionCsvDataSource implements CsvDataSource {
  constructor(private getSubmissionData: (id: string) => any) {}

  getDataById(id: string): Record<string, any> | null {
    return this.getSubmissionData(id);
  }

  getAllIds(): string[] {
    // This would typically come from your CSV data utility
    return ['UW-2025-001', 'UW-2025-002', 'UW-2025-003'];
  }

  getFieldValue(id: string, field: string): string {
    const data = this.getDataById(id);
    return data?.[field] || '';
  }

  hasMultipleEntries(id: string): boolean {
    const data = this.getDataById(id);
    // Check if this is a multi-property submission
    return !!(data?.property2_address_line1 || data?.property2_house_number);
  }
}

export class SlipCsvDataSource implements CsvDataSource {
  constructor(private getSlipData: (id: string) => any) {}

  getDataById(id: string): Record<string, any> | null {
    return this.getSlipData(id);
  }

  getAllIds(): string[] {
    return ['SLP-2025-001', 'SLP-2025-002', 'SLP-2025-003'];
  }

  getFieldValue(id: string, field: string): string {
    const data = this.getDataById(id);
    return data?.[field] || '';
  }

  hasMultipleEntries(id: string): boolean {
    return false; // Slips typically don't have multiple entries
  }
}

interface UseConfigurableFormProps {
  formType: 'submission-data-extraction' | 'slip-data-extraction';
  recordId: string;
  csvDataSource: CsvDataSource;
}

export function useConfigurableForm({ formType, recordId, csvDataSource }: UseConfigurableFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Load form configuration
  const { data: config, isLoading: isConfigLoading, error: configError } = useQuery({
    queryKey: ['form-config', formType],
    queryFn: async (): Promise<FormConfig> => {
      const response = await fetch(`/api/config/${formType}`);
      if (!response.ok) {
        throw new Error('Failed to load form configuration');
      }
      return response.json();
    }
  });

  // Load CSV data for the record
  const csvData = useMemo(() => {
    return csvDataSource.getDataById(recordId);
  }, [csvDataSource, recordId]);

  // Initialize form data when config and CSV data are loaded
  useEffect(() => {
    if (!config || !csvData) return;

    const initialData: Record<string, any> = {};
    
    config.sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.csvField) {
          initialData[field.id] = csvData[field.csvField] || '';
        } else if (field.csvFields) {
          // Handle composite fields like addresses
          const compositeValue = Object.entries(field.csvFields)
            .map(([key, csvField]) => csvData[csvField] || '')
            .filter(val => val.trim())
            .join(', ');
          initialData[field.id] = compositeValue;
        } else if (field.value === 'auto_generated') {
          // Handle auto-generated fields
          switch (field.type) {
            case 'datetime':
              initialData[field.id] = new Date().toISOString();
              break;
            case 'date':
              initialData[field.id] = new Date().toISOString().split('T')[0];
              break;
            default:
              initialData[field.id] = field.value || '';
          }
        } else {
          initialData[field.id] = field.value || '';
        }
      });
    });

    setFormData(initialData);
    setIsDirty(false);
  }, [config, csvData]);

  // Handle field changes
  const handleFieldChange = (fieldId: string, value: string) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    setIsDirty(true);

    // Clear validation error for this field
    if (validationErrors[fieldId]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    if (!config) return false;

    const errors: Record<string, string> = {};

    // Check required fields
    config.validation.requiredFields.forEach(fieldId => {
      const value = formData[fieldId];
      if (!value || value.toString().trim() === '') {
        const field = config.sections.flatMap(s => s.fields).find(f => f.id === fieldId);
        errors[fieldId] = `${field?.label || fieldId} is required`;
      }
    });

    // Type-specific validation
    config.sections.forEach(section => {
      section.fields.forEach(field => {
        const value = formData[field.id];
        if (value && value.toString().trim()) {
          // Email validation
          if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors[field.id] = 'Invalid email format';
          }
          
          // Number validation
          if (field.type === 'number' && isNaN(parseFloat(value))) {
            errors[field.id] = 'Must be a valid number';
          }
          
          // Date validation
          if (field.type === 'date' && isNaN(new Date(value).getTime())) {
            errors[field.id] = 'Invalid date format';
          }
          
          // Currency validation
          if (field.type === 'currency' && !/^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(value.replace(/[£€¥]/, '$'))) {
            errors[field.id] = 'Invalid currency format';
          }
        }
      });
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Get field confidence score
  const getFieldConfidence = (fieldId: string): { level: 'high' | 'medium' | 'low'; score: number; color: string } => {
    if (!config || !csvData) return { level: 'medium', score: 75, color: 'bg-yellow-100 text-yellow-800' };

    const field = config.sections.flatMap(s => s.fields).find(f => f.id === fieldId);
    if (!field) return { level: 'medium', score: 75, color: 'bg-yellow-100 text-yellow-800' };

    // Calculate confidence based on field configuration and data quality
    let confidence = 75; // Base confidence

    // Adjust based on field's configured confidence level
    switch (field.confidenceScore) {
      case 'high':
        confidence = 85;
        break;
      case 'medium':
        confidence = 70;
        break;
      case 'low':
        confidence = 55;
        break;
    }

    // Adjust based on data quality
    const fieldValue = csvData[field.csvField || fieldId];
    if (fieldValue && fieldValue.toString().trim()) {
      confidence += 10; // Bonus for having data
      
      // Type-specific quality checks
      switch (field.type) {
        case 'email':
          confidence += /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue) ? 5 : -10;
          break;
        case 'currency':
          confidence += /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/.test(fieldValue) ? 5 : -5;
          break;
        case 'date':
          confidence += !isNaN(new Date(fieldValue).getTime()) ? 5 : -10;
          break;
        case 'number':
          confidence += !isNaN(parseFloat(fieldValue)) ? 5 : -10;
          break;
      }
    } else {
      confidence -= 20; // Penalty for missing data
    }

    // Determine level based on thresholds
    const thresholds = config.confidence.thresholds;
    let level: 'high' | 'medium' | 'low' = 'medium';
    
    if (confidence >= thresholds.high) {
      level = 'high';
    } else if (confidence >= thresholds.medium) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return {
      level,
      score: Math.min(99, Math.max(1, confidence)),
      color: config.confidence.colors[level]
    };
  };

  return {
    config,
    formData,
    csvData,
    validationErrors,
    isDirty,
    isConfigLoading,
    configError,
    handleFieldChange,
    validateForm,
    getFieldConfidence,
    resetForm: () => {
      setFormData({});
      setValidationErrors({});
      setIsDirty(false);
    }
  };
}