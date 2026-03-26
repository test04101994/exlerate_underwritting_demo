// S3 service for uploading Mismatch Summary JSON files
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { credentialManager } from '../core/config/credential-manager';

interface MismatchSummaryData {
  caseId: string;
  summary: string;
  timestamp: string;
  sessionId: string;
  ticketKey?: string;
}

class S3Service {
  private s3: AWS.S3 | null = null;
  private bucketName: string = '';

  constructor() {
    this.initializeS3();
  }

  private async initializeS3() {
    try {
      // Load credentials from credentials.json using credentialManager
      const awsCredentials = await credentialManager.getAWSCredentials();
      
      if (!awsCredentials) {
        console.log('[S3 Service] AWS credentials not available in credentials.json - S3 upload disabled');
        return;
      }

      console.log(`[S3 Service] Using AWS credentials from credentials.json - Access Key: ${awsCredentials.access_key_id}`);

      AWS.config.update({
        accessKeyId: awsCredentials.access_key_id,
        secretAccessKey: awsCredentials.secret_access_key,
        sessionToken: awsCredentials.session_token,
        region: awsCredentials.region
      });

      this.s3 = new AWS.S3();
      this.bucketName = awsCredentials.services.s3.bucket_name;
      
      console.log(`[S3 Service] Initialized successfully with credentials.json - bucket: ${this.bucketName}`);
    } catch (error) {
      console.error('[S3 Service] Failed to initialize:', error);
    }
  }

  async uploadMismatchSummary(ticketKey: string, data: any): Promise<{ success: boolean; location?: string; filename?: string; error?: string }> {
    try {
      const summaryData: MismatchSummaryData = {
        caseId: ticketKey,
        summary: data.summary || 'Mismatch summary completed',
        sessionId: data.sessionId || 'unknown',
        timestamp: data.timestamp || new Date().toISOString(),
        ticketKey: ticketKey
      };
      
      const location = await this.uploadMismatchSummaryJson(summaryData);
      
      if (location) {
        return {
          success: true,
          location: location,
          filename: `${ticketKey}.json`
        };
      } else {
        return {
          success: false,
          error: 'S3 upload returned null'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async uploadMismatchSummaryJson(data: MismatchSummaryData): Promise<string | null> {
    if (!this.s3) {
      console.log('[S3 Service] S3 not initialized - skipping upload');
      return null;
    }

    try {
      // Load static configurable content
      const staticContentPath = path.join(process.cwd(), 'config', 'static-mismatch-content.json');
      const staticContent = fs.readFileSync(staticContentPath, 'utf-8');
      const staticJson = JSON.parse(staticContent);

      const fileName = `${data.caseId}.json`;
      const fileContent = JSON.stringify(staticJson, null, 2);

      console.log(`[S3 Service] Uploading mismatch summary to nbs/analytics_output/: ${fileName}`);

      const uploadParams = {
        Bucket: this.bucketName,
        Key: `nbs/analytics_output/${fileName}`,
        Body: fileContent,
        ContentType: 'application/json',
        Metadata: {
          'case-id': data.caseId,
          'session-id': data.sessionId,
          'uploaded-by': 'mismatch-summary-agent',
          'agent-type': 'jira-workflow'
        }
      };

      const result = await this.s3.upload(uploadParams).promise();
      
      console.log(`[S3 Service] Upload successful: ${result.Location}`);
      
      return result.Location;
    } catch (error) {
      console.error('[S3 Service] Upload failed:', error);
      return null;
    }
  }

  async uploadScreenRecording(
    sessionId: string,
    videoBlob: Buffer,
    metadata: {
      caseId?: string;
      ticketKey?: string;
      duration?: number;
      timestamp?: string;
    }
  ): Promise<{ success: boolean; location?: string; filename?: string; error?: string }> {
    if (!this.s3) {
      return {
        success: false,
        error: 'S3 not initialized'
      };
    }

    try {
      const timestamp = metadata.timestamp || new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `screen-recording-${sessionId}-${timestamp}.webm`;
      
      console.log(`[S3 Service] Uploading screen recording: ${fileName}`);

      const uploadParams = {
        Bucket: this.bucketName,
        Key: `screen-recordings/${fileName}`,
        Body: videoBlob,
        ContentType: 'video/webm',
        Metadata: {
          'session-id': sessionId,
          'case-id': metadata.caseId || 'unknown',
          'ticket-key': metadata.ticketKey || 'unknown',
          'duration': String(metadata.duration || 0),
          'uploaded-at': new Date().toISOString(),
          'uploaded-by': 'screen-recording-service'
        }
      };

      const result = await this.s3.upload(uploadParams).promise();
      
      console.log(`[S3 Service] Screen recording upload successful: ${result.Location}`);
      
      return {
        success: true,
        location: result.Location,
        filename: fileName
      };
    } catch (error) {
      console.error('[S3 Service] Screen recording upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async testS3Connection(): Promise<boolean> {
    if (!this.s3) {
      return false;
    }

    try {
      await this.s3.headBucket({ Bucket: this.bucketName }).promise();
      return true;
    } catch (error) {
      console.error('[S3 Service] Connection test failed:', error);
      return false;
    }
  }
}

export const s3Service = new S3Service();