// Local API Client for connecting to applications running on local laptop

export class LocalApiClient {
  private baseUrl: string;
  
  constructor(baseUrl?: string) {
    // Use environment variable or default to localhost, clean up whitespace
    const rawUrl = baseUrl || process.env.LOCAL_API_URL || 'http://localhost:3000';
    this.baseUrl = rawUrl.replace(/\s+/g, '').trim();
  }
  
  async makeRequest(endpoint: string, options: RequestInit = {}) {
    try {
      // Ensure clean URL construction by trimming both base and endpoint
      const cleanBase = this.baseUrl.trim().replace(/\/+$/, ''); // Remove trailing slashes
      const cleanEndpoint = endpoint.trim().replace(/^\/+/, ''); // Remove leading slashes
      const url = `${cleanBase}/${cleanEndpoint}`;
      console.log(`[Local API] Making request to: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`[Local API] Request failed:`, error);
      throw error;
    }
  }
  
  // GET request
  async get(endpoint: string, headers?: Record<string, string>) {
    return this.makeRequest(endpoint, { method: 'GET', headers });
  }
  
  // POST request
  async post(endpoint: string, data: any, headers?: Record<string, string>) {
    return this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      headers,
    });
  }
  
  // PUT request
  async put(endpoint: string, data: any, headers?: Record<string, string>) {
    return this.makeRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      headers,
    });
  }
  
  // DELETE request
  async delete(endpoint: string, headers?: Record<string, string>) {
    return this.makeRequest(endpoint, { method: 'DELETE', headers });
  }
  
  // Test connection to local application
  async testConnection() {
    try {
      await this.get('/health');
      console.log(`[Local API] Successfully connected to ${this.baseUrl}`);
      return true;
    } catch (error) {
      console.log(`[Local API] Cannot connect to ${this.baseUrl} - using fallback`);
      return false;
    }
  }
}

export const localApiClient = new LocalApiClient();