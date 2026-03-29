import { LocalApiTester } from '@/components/local-api-tester';

export default function LocalApiTestPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">EXLerate AI - Local API Testing</h1>
          <p className="text-gray-600 mt-2">
            Test API calls from this Replit application to applications running on your local laptop
          </p>
        </div>
        
        <LocalApiTester />
        
        <div className="mt-8 bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">How to Use</h2>
          <div className="space-y-4 text-sm text-gray-700">
            <div>
              <strong>1. Start your local application:</strong>
              <p>Make sure your application is running on your laptop (e.g., localhost:3000)</p>
            </div>
            
            <div>
              <strong>2. Expose it with ngrok (recommended):</strong>
              <pre className="bg-gray-100 p-2 rounded mt-1 text-xs">
                ngrok http 3000
              </pre>
              <p>Copy the public URL (e.g., https://abc123.ngrok.io)</p>
            </div>
            
            <div>
              <strong>3. Set environment variable:</strong>
              <p>Add LOCAL_API_URL=https://abc123.ngrok.io to your Replit environment</p>
            </div>
            
            <div>
              <strong>4. Test the connection:</strong>
              <p>Click "Test Connection" to verify the proxy is working</p>
            </div>
            
            <div>
              <strong>5. Make API calls:</strong>
              <p>Use the form above to test GET/POST requests to your local application</p>
            </div>
          </div>
        </div>
        
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">API Routes Available</h3>
          <div className="space-y-2 text-sm text-blue-800">
            <div><code>GET /api/local/test</code> - Test connection status</div>
            <div><code>GET /api/local/*</code> - Proxy GET requests</div>
            <div><code>POST /api/local/*</code> - Proxy POST requests</div>
            <div><code>PUT /api/local/*</code> - Proxy PUT requests</div>
            <div><code>DELETE /api/local/*</code> - Proxy DELETE requests</div>
          </div>
        </div>
      </div>
    </div>
  );
}