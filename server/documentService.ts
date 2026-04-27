import fs from 'fs';
import path from 'path';

export interface DocumentInfo {
  id: string;
  name: string;
  type: 'email' | 'pdf' | 'image' | 'doc' | 'docx' | 'spreadsheet' | 'other';
  path: string;
  size?: number;
  lastModified?: Date;
}

export class DocumentService {
  private readonly documentsPath = path.join(process.cwd(), 'assets/documents/documents');
  private readonly submissionDefaultsPath = path.join(process.cwd(), 'assets/documents/documents/_submission_defaults');
  private readonly claimDefaultsPath = path.join(process.cwd(), 'assets/documents/documents/_claim_defaults');

  constructor() {
    // Ensure documents directory exists
    if (!fs.existsSync(this.documentsPath)) {
      fs.mkdirSync(this.documentsPath, { recursive: true });
    }
  }

  /**
   * Get all documents for a specific case ID
   */
  async getDocumentsForCase(caseId: string, workflowType?: string): Promise<DocumentInfo[]> {
    const casePath = path.join(this.documentsPath, caseId);

    // For submission workflows, always use the shared submission defaults folder.
    // For claim workflows, always use the shared claim defaults folder.
    const isSubmissionWorkflow = workflowType === 'submission' || caseId.startsWith('SUB-') || caseId.startsWith('UW-');
    const isClaimWorkflow = workflowType === 'claim' || caseId.startsWith('CLM-');
    const finalPath = isSubmissionWorkflow
      ? this.submissionDefaultsPath
      : isClaimWorkflow
        ? this.claimDefaultsPath
        : casePath;
    
    if (!fs.existsSync(finalPath)) {
      return [];
    }

    try {
      const files = fs.readdirSync(finalPath);
      const documents: DocumentInfo[] = [];

      for (const file of files) {
        const filePath = path.join(finalPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
          const document: DocumentInfo = {
            id: `${caseId}-${file}`,
            name: file,
            type: this.getDocumentType(file),
            path: filePath,
            size: stats.size,
            lastModified: stats.mtime
          };
          documents.push(document);
        }
      }

      return documents.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error(`Error reading documents for case ${caseId}:`, error);
      return [];
    }
  }

  /**
   * Get document content
   */
  async getDocumentContent(caseId: string, fileName: string): Promise<string | null> {
    let filePath = path.join(this.documentsPath, caseId, fileName);

    // Route to the matching shared defaults folder for submission/claim cases
    const isSubmissionWorkflow = caseId.startsWith('SUB-') || caseId.startsWith('UW-');
    const isClaimWorkflow = caseId.startsWith('CLM-');
    if (isSubmissionWorkflow) {
      filePath = path.join(this.submissionDefaultsPath, fileName);
    } else if (isClaimWorkflow) {
      filePath = path.join(this.claimDefaultsPath, fileName);
    }
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading document ${fileName} for case ${caseId}:`, error);
      return null;
    }
  }

  /**
   * Check if case has documents
   */
  async caseHasDocuments(caseId: string): Promise<boolean> {
    const casePath = path.join(this.documentsPath, caseId);
    return fs.existsSync(casePath) && fs.readdirSync(casePath).length > 0;
  }

  /**
   * Get available case IDs that have documents
   */
  async getAvailableCases(): Promise<string[]> {
    try {
      const directories = fs.readdirSync(this.documentsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      const casesWithDocuments: string[] = [];
      for (const dir of directories) {
        if (await this.caseHasDocuments(dir)) {
          casesWithDocuments.push(dir);
        }
      }

      return casesWithDocuments.sort();
    } catch (error) {
      console.error('Error getting available cases:', error);
      return [];
    }
  }

  /**
   * Determine document type based on file extension
   */
  private getDocumentType(fileName: string): DocumentInfo['type'] {
    const ext = path.extname(fileName).toLowerCase();
    
    switch (ext) {
      case '.html':
        return fileName.toLowerCase().includes('email') ? 'email' : 'other';
      case '.eml':
      case '.msg':
        return 'email';
      case '.pdf':
        return 'pdf';
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif':
        return 'image';
      case '.doc':
        return 'doc';
      case '.docx':
        return 'docx';
      case '.csv':
      case '.xlsx':
      case '.xls':
        return 'spreadsheet';
      default:
        return 'other';
    }
  }
}

export const documentService = new DocumentService();