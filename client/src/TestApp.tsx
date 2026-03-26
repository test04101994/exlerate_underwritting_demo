// Minimal working React component to test if React is loading
export default function TestApp() {
  return (
    <div style={{ 
      padding: '40px', 
      textAlign: 'center', 
      fontFamily: 'Arial, sans-serif',
      background: '#f8fafc',
      minHeight: '100vh'
    }}>
      <div style={{ 
        maxWidth: '600px', 
        margin: '0 auto', 
        background: 'white', 
        padding: '40px', 
        borderRadius: '8px', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)' 
      }}>
        <h1 style={{ color: '#059669', marginBottom: '20px' }}>✅ React App Working!</h1>
        <h2 style={{ color: '#374151', marginBottom: '20px' }}>Insurance Workflow System</h2>
        <p style={{ color: '#6b7280', marginBottom: '30px' }}>
          React frontend is now loading successfully. All JavaScript execution issues have been resolved.
        </p>
        
        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '30px' }}>
          <button 
            style={{ 
              padding: '12px 24px', 
              background: '#3b82f6', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onClick={() => window.location.href = '/login'}
          >
            Go to Login
          </button>
          <button 
            style={{ 
              padding: '12px 24px', 
              background: '#10b981', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onClick={() => window.location.href = '/dashboard'}
          >
            Dashboard
          </button>
          <button 
            style={{ 
              padding: '12px 24px', 
              background: '#f59e0b', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onClick={() => window.location.href = '/jira-dashboard'}
          >
            Jira Dashboard
          </button>
        </div>

        <div style={{ 
          background: '#f0f9ff', 
          border: '1px solid #0ea5e9', 
          borderRadius: '4px', 
          padding: '16px',
          marginTop: '20px'
        }}>
          <p style={{ margin: '0', fontSize: '14px' }}>
            <strong>Test Credentials:</strong> test@example.com / password123
          </p>
        </div>
      </div>
    </div>
  );
}