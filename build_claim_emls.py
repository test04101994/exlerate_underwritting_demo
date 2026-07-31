flowchart LR

    A[Broker Email] --> B[Generali Mailbox]
    B --> C[Forward Email to Xtrakto]

    subgraph Intake["AUTOMATED — EMAIL INGESTION"]
        C --> D[Receive Email and Attachments]
        D --> E[Create Temporary Intake Record]
        E --> F[Send to Indexing Queue]
    end

    subgraph Indexing["HUMAN — INDEXING TEAM"]
        F --> T0{Submission-related email?}
        T0 -->|No| EX[Exception / Non-Submission Queue]
        T0 -->|Yes| G[Review Email]

        G --> H{Business Event Classification}

        H -->|New Business Submission| I[Create New Xtrakto Job]
        H -->|Renewal| I
        H -->|Submission Update| J{Operational Routing}
        H -->|Endorsement| J
        H -->|Bind| J
        H -->|Cancellation| J

        J -->|Submission Team| K[Submission Update Queue]
        J -->|SOV Team| L[SOV Update Queue]
        J -->|Financial Team| M[Financial Update Queue]
        J -->|Unclassified| N[Other Processing Queue]
    end

    subgraph Setup["AUTOMATED — NEW BUSINESS"]
        I --> O[Submission Setup Extraction]
        O --> P["Complete Document Extraction<br/>(single pass)"]
        P --> Q[Assign to Submission Validation Queue]
    end
    P -.->|technical failure| EX

    subgraph Linking["HUMAN + SYSTEM ASSISTED — CASE LINKING"]
        K --> R[Search Existing Case]
        L --> R
        M --> R
        N --> R

        R --> S{Case Found?}
        S -->|Yes, high confidence| T[Identify Existing Xtrakto Job]
        S -->|No / low confidence| U[Manual Case Search]
        U --> T
        U -.->|no match found| EX
    end

    subgraph Mapping["SYSTEM — CASE MAPPING REPOSITORY"]
        MAP[(Job ID to Agora ID Mapping)]
    end
    MAP -.->|lookup| R

    subgraph Update["AUTOMATED — SUBMISSION UPDATE"]
        T --> V["Attach New Email and Documents<br/>to Existing Job"]
        V --> W[Load Previous Validated Documents]
        W --> X[Load Previous Validated Values]
        X --> Y{Operational Queue}

        Y -->|Submission Team| Z[Submission Update Extraction]
        Y -->|SOV Team| AA[SOV Update Extraction]
        Y -->|Financial Team| AB[Financial Extraction]
    end

    subgraph Validation["HUMAN — VALIDATION"]
        Q --> AC[Submission Validation]
        Z --> AC

        AC --> SG{Route to SOV team?}
        SG -->|Yes| AD[SOV Validation]
        SG -->|No| AF[Submit Combined Validated Case]
        AD --> AF

        AA --> AD
        AB --> AE[Financial Validation]
        AE --> AF
    end

    subgraph Version["AUTOMATED — VERSION MANAGEMENT"]
        AF --> AG[Create New Version]
        AG --> AH{Previous version exists?}
        AH -->|No| AJ[Update Current Validated Case]
        AH -->|Yes| AHC[Compare Previous vs Current]
        AHC --> AI[Generate Delta Summary]
        AI --> AJ
    end

    subgraph UW["HUMAN — UNDERWRITING"]
        AJ --> AM[Ready for Submission]
    end

    subgraph Downstream["AUTOMATED — DOWNSTREAM"]
        AM --> AN[Generate Payload]
        AN --> AO[ESB]
        AO --> AP[Agora]
        AP --> AQ[Receive Agora ID]
        AQ --> AR[Update Job ID to Agora ID Mapping]
    end
    AR -.->|write| MAP

    classDef auto fill:#E6F1FB,stroke:#185FA5,color:#0C447C
    classDef human fill:#FAEEDA,stroke:#854F0B,color:#633806
    classDef decision fill:#EEEDFE,stroke:#534AB7,color:#3C3489
    classDef store fill:#E1F5EE,stroke:#0F6E56,color:#085041
    classDef exception fill:#FCEBEB,stroke:#A32D2D,color:#791F1F

    class A,B,C,D,E,F,O,P,Q,V,W,X,Z,AA,AB,AG,AHC,AI,AJ,AN,AO,AP,AQ,AR auto
    class G,I,K,L,M,N,R,U,T,AC,AD,AE,AF,AM human
    class T0,H,J,S,Y,SG,AH,AK decision
    class MAP store
    class EX exception
    