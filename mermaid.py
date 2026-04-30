sequenceDiagram
    autonumber
    actor CH as Claim Handler
    participant SN as ServiceNow
    participant XT as Xtrakto
    participant S3 as S3 Storage
    participant DP as Dragon Policy

    rect rgb(240, 240, 250)
    Note over SN,S3: Phase 1 - Document Ingestion
    SN->>XT: [1] uploadDocument(email, attachments)
    activate XT
    XT->>S3: [2a] storeFiles(payload)
    activate S3
    S3-->>XT: [2b] filePath
    deactivate S3
    XT-->>SN: [2c] filePath
    deactivate XT
    end

    rect rgb(245, 240, 230)
    Note over SN,XT: Phase 2 - Job Creation
    SN->>XT: [3] startJob(messageId)
    activate XT
    XT-->>SN: [4] jobId
    deactivate XT
    Note over SN: [5] Persist mapping {jobId, messageId}
    end

    rect rgb(235, 245, 240)
    Note over SN,XT: Phase 3 - Extraction and Notification
    activate XT
    Note over XT: [6] Process email and attachments for data extraction
    XT-->>SN: [7] notifyExtractionComplete(jobId)
    deactivate XT
    SN->>XT: [8] getJobOutput(jobId)
    activate XT
    XT-->>SN: [8a] extractedData
    deactivate XT
    end

    rect rgb(250, 240, 240)
    Note over CH,SN: Phase 4 - Case Assignment
    CH->>SN: [9] openCase and selfAssign
    activate SN
    SN->>XT: [10] assignJob(jobId, handlerId)
    SN->>XT: [11] renderUI(idpTab)
    deactivate SN
    end

    rect rgb(240, 245, 250)
    Note over XT,DP: Phase 5 - Data Display and Enrichment
    activate XT
    XT->>S3: [12a] fetchExtractedData(jobId)
    activate S3
    S3-->>XT: [12b] extractedData
    deactivate S3
    Note over XT: [12c] Display data for validation
    XT->>DP: [13] enrichData(extractedData)
    activate DP
    DP-->>XT: [13a] enrichedData
    deactivate DP
    deactivate XT
    end

    rect rgb(245, 245, 235)
    Note over CH,DP: Phase 6 - Validation and Re-enrichment
    CH->>XT: [14] reviewAndEdit(data)
    activate XT
    alt Edits were made
        XT->>DP: [15a] reEnrichData(updatedData)
        activate DP
        DP-->>XT: [15b] updatedEnrichment
        deactivate DP
        XT->>S3: [15c] saveUpdatedData(jobId, payload)
    end
    deactivate XT
    end

    rect rgb(240, 250, 245)
    Note over XT,SN: Phase 7 - Final Submission
    activate XT
    Note over XT: [16a] Transform payload to required format
    XT->>SN: [16b] sendFinalOutput(payload)
    deactivate XT
    end