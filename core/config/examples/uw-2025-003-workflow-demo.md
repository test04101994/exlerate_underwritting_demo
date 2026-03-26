# UW-2025-003 Multi-Property Workflow Demonstration

## Overview
This document demonstrates how UW-2025-003 (Emma Wilson) will render with multiple property sections using the configuration-driven form system.

## Client Information
- **Client Name**: Emma Wilson
- **Broker**: Emma Wilson (Willis Towers Watson)
- **Email**: emma.wilson@willistowerswatson.com
- **Policy Type**: Multi-Property Home Insurance
- **Total Property Value**: £1,575,000

## Property Details

### Property 1 - Primary Residence (Blue Section)
- **Address**: 156 The Gables, Park Avenue, Birmingham B15 2TH
- **Type**: House - Detached
- **Value**: £850,000
- **Built**: 1985
- **Bedrooms**: 4
- **Bathrooms**: 3
- **Construction**: Brick
- **Roof**: Tiles
- **Security**: Alarm System, CCTV, Motion Sensors

### Property 2 - Holiday Home (Green Section)
- **Address**: 42 Seaside Cottage, Coastal Road, Brighton BN1 3AN
- **Type**: House - Terraced
- **Value**: £725,000
- **Built**: 1920
- **Bedrooms**: 3
- **Bathrooms**: 2
- **Construction**: Stone
- **Roof**: Slate
- **Security**: Smart Door Locks, Window Sensors

## Form Layout Visualization

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT INFORMATION                        │
│  [Emma Wilson] High 98%         [Emma Wilson] High 95%      │
│  [emma.wilson@...] High 99%     [Multi-Property...] High 92%│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ │ PROPERTY 1 DETAILS (Blue Background)                      │
│ │ [156 The Gables, Park Avenue, Birmingham B15 2TH]         │
│ │ High 96% - Full Width                                      │
│ │ [House - Detached] [£850,000]      [1985]                │
│ │ High 94%           High 91%        Medium 78%             │
│ │ [4]                [3]             [Brick]                │
│ │ Medium 85%         Medium 82%      Medium 76%             │
│ │ [Tiles]            [Alarm System, CCTV, Motion Sensors]  │
│ │ Medium 73%         Low 65% - 2 Columns                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ │ PROPERTY 2 DETAILS (Green Background)                     │
│ │ [42 Seaside Cottage, Coastal Road, Brighton BN1 3AN]     │
│ │ High 93% - Full Width                                      │
│ │ [House - Terraced] [£725,000]      [1920]                │
│ │ High 89%           High 88%        Medium 81%             │
│ │ [3]                [2]             [Stone]                │
│ │ Medium 86%         Medium 84%      Medium 79%             │
│ │ [Slate]            [Smart Door Locks, Window Sensors]    │
│ │ Medium 77%         Low 62% - 2 Columns                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ │ SUMMARY INFORMATION (Gray Background)                     │
│ │ [£1,575,000]                [2]                          │
│ │ High 100%                   High 100%                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  [Approve & Continue] (Green)    [Reject & Stop] (Red)      │
└─────────────────────────────────────────────────────────────┘
```

## Configuration Structure

### Section Configuration
```json
{
  "sections": [
    {
      "id": "client-information",
      "title": "CLIENT INFORMATION",
      "type": "field-grid",
      "columns": 2,
      "styling": {
        "sectionBackground": "bg-white",
        "sectionBorder": "border-b border-gray-200 pb-6 mb-6"
      }
    },
    {
      "id": "property-1-details",
      "title": "PROPERTY 1 DETAILS",
      "type": "field-grid",
      "columns": 3,
      "styling": {
        "sectionBackground": "bg-blue-50",
        "sectionBorder": "border-l-4 border-blue-400 pl-4 mb-6"
      }
    },
    {
      "id": "property-2-details",
      "title": "PROPERTY 2 DETAILS",
      "type": "field-grid",
      "columns": 3,
      "styling": {
        "sectionBackground": "bg-green-50",
        "sectionBorder": "border-l-4 border-green-400 pl-4 mb-6"
      }
    }
  ]
}
```

### Field Grid Positioning
- **span-1**: Single column width
- **span-2**: Two column width
- **span-3**: Three column width (full width in 3-column grid)
- **span-full**: Full width regardless of grid columns

### CSV Data Structure
```csv
submission_id,client_name,broker_name,broker_email,
property1_address,property1_type,property1_value,property1_bedrooms,property1_bathrooms,property1_year_built,property1_construction_type,property1_roof_type,property1_security_features,
property2_address,property2_type,property2_value,property2_bedrooms,property2_bathrooms,property2_year_built,property2_construction_type,property2_roof_type,property2_security_features,
total_property_value,policy_type

UW-2025-003,Emma Wilson,Emma Wilson,emma.wilson@willistowerswatson.com,
"156 The Gables, Park Avenue, Birmingham B15 2TH",House - Detached,850000,4,3,1985,Brick,Tiles,"Alarm System, CCTV, Motion Sensors",
"42 Seaside Cottage, Coastal Road, Brighton BN1 3AN",House - Terraced,725000,3,2,1920,Stone,Slate,"Smart Door Locks, Window Sensors",
1575000,Multi-Property Home Insurance
```

## Confidence Scoring
- **High (90-100%)**: Green badge - Basic client information, addresses, property types
- **Medium (70-89%)**: Yellow badge - Structural details, room counts, construction details
- **Low (60-69%)**: Red badge - Security features, optional details

## Workflow Execution
1. **Data Extraction Agent** completes and populates all fields from CSV
2. **Form renders** with 4 distinct sections and proper styling
3. **Human reviews** extracted data with confidence scores
4. **User approves** or rejects the extraction
5. **Workflow continues** with remaining agents if approved

## Benefits
- **Visual Distinction**: Each property has different colored sections
- **Organized Layout**: Logical grouping of related information
- **Confidence Indicators**: Clear quality assessment for each field
- **Scalable Design**: Easy to add more properties by extending configuration
- **Data Integrity**: Calculated totals and cross-validation

## Next Steps
- Navigate to workflow `SUB-1752321633606-s7df6t97` to see the system in action
- Data extraction form will show this exact layout with UW-2025-003 data
- System will demonstrate multi-property handling with configuration-driven rendering