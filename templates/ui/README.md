# Data Extraction Interface Configuration

This directory contains configuration files for dynamically generating data extraction form interfaces for different workflow types.

## Overview

The interface configuration system allows you to define form layouts, fields, validation rules, and styling through JSON configuration files, eliminating the need to modify React components for UI changes.

## Configuration Files

### `submission-data-extraction.json`
Defines the complete interface for submission workflow data extraction forms including:
- Form title and subtitle
- Field definitions with CSV mapping
- Validation rules and confidence scoring
- Action buttons (Approve/Reject)
- Styling and layout configuration

### `slip-data-extraction.json`
Defines the complete interface for slip workflow data extraction forms including:
- Lloyd's market specific fields
- Syndicate participation tables
- Risk information sections
- Coverage details with currency formatting

### `interface-generator.js`
JavaScript utility class that converts configuration files into React component configurations with:
- Dynamic field generation
- Confidence score calculation
- Validation rule processing
- CSV data integration

## Interface Configuration Structure

```json
{
  "interface": {
    "title": "Form Title",
    "subtitle": "Form Description",
    "formType": "ComponentName",
    "submissionSelector": {
      "enabled": true,
      "defaultValue": "UW-2025-001"
    }
  },
  "sections": [
    {
      "id": "section-id",
      "title": "SECTION TITLE",
      "type": "field-grid",
      "columns": 2,
      "fields": [
        {
          "id": "field-id",
          "csvField": "csv_column_name",
          "label": "Field Label",
          "type": "text",
          "required": true,
          "editable": true,
          "confidenceScore": "high"
        }
      ]
    }
  ],
  "actions": {
    "primary": {
      "label": "Approve & Continue",
      "endpoint": "/api/workflows/{sessionId}/approve-extraction"
    }
  }
}
```

## Field Types Supported

### Basic Field Types
- `text` - Single line text input
- `textarea` - Multi-line text input
- `email` - Email input with validation
- `date` - Date picker with format options
- `select` - Dropdown selection
- `currency` - Currency input with prefix/suffix
- `percentage` - Percentage input with validation

### Advanced Field Types
- `table` - Dynamic table with multiple columns
- `tabbed-section` - Tabbed interface for grouped fields
- `field-grid` - Grid layout for multiple fields

## Confidence Scoring

Each field can have a confidence score that determines the badge color:
- `high` - Green badge (95-99%)
- `medium` - Yellow badge (85-94%)
- `low` - Red badge (65-79%)

## Validation Rules

Fields support comprehensive validation:
```json
{
  "validation": {
    "pattern": "^REF-HU-[0-9]{6}$",
    "min": 100,
    "max": 1000000,
    "message": "Custom error message"
  }
}
```

## CSV Data Integration

Fields are automatically populated from CSV data using the `csvField` mapping:
```json
{
  "csvField": "broker_ref_number",
  "dataSource": {
    "csvFile": "submissions.csv",
    "keyField": "submission_id"
  }
}
```

## Usage Examples

### Loading Interface Configuration
```javascript
const generator = new InterfaceGenerator('./config/interfaces');
const config = generator.loadInterfaceConfig('submission');
```

### Generating Dynamic Form
```javascript
const interfaceConfig = generator.generateInterface('submission', csvData, sessionId);
```

### Creating New Use Cases

To add a new workflow type (e.g., "marine-insurance"):

1. **Create Configuration File**
```bash
cp submission-data-extraction.json marine-insurance-data-extraction.json
```

2. **Customize Fields**
```json
{
  "interface": {
    "title": "Marine Insurance Data Extraction",
    "formType": "MarineDataExtractionForm"
  },
  "sections": [
    {
      "title": "VESSEL DETAILS",
      "fields": [
        {
          "id": "vessel_name",
          "csvField": "vessel_name",
          "label": "Vessel Name",
          "type": "text",
          "required": true
        }
      ]
    }
  ]
}
```

3. **Update CSV Data Source**
```json
{
  "dataSource": {
    "csvFile": "marine-insurance.csv",
    "keyField": "vessel_id"
  }
}
```

4. **Generate Interface**
```javascript
const marineInterface = generator.generateInterface('marine-insurance', csvData, sessionId);
```

## Benefits

### ✅ Configuration-Driven UI
- Add/remove fields without code changes
- Modify validation rules via JSON
- Update styling and layout configuration
- Change field types and options

### ✅ Dynamic Field Generation
- Automatic CSV data mapping
- Confidence score calculation
- Validation rule processing
- Form action generation

### ✅ Flexible Layout System
- Grid-based field layouts
- Tabbed sections for grouped data
- Table components for structured data
- Responsive design support

### ✅ Easy Customization
- Field-specific styling
- Custom validation messages
- Configurable confidence thresholds
- Flexible data source mapping

## Styling Configuration

The system supports comprehensive styling through the configuration:

```json
{
  "styling": {
    "backgroundColor": "bg-gray-50",
    "confidenceBadges": {
      "high": {
        "color": "bg-green-100 text-green-800",
        "label": "High ({percentage}%)"
      }
    },
    "fieldStyles": {
      "default": "w-full px-3 py-2 border border-gray-300 rounded-md",
      "error": "border-red-500 bg-red-50"
    }
  }
}
```

This configuration system provides complete control over the data extraction interface without requiring any code modifications, enabling easy creation of new use cases and workflow types.