export const API_URL = '/api/v1';

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;
  
  // We use httpOnly cookies for tokens, so we include credentials
  options.credentials = 'include';
  
  if (!options.headers) {
    options.headers = {};
  }
  
  if (!(options.body instanceof FormData)) {
    (options.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    /*
    if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
       // Ideally we could try to call /auth/refresh here first
       // For now, redirect to login
       window.location.href = '/login';
    }
    */
    
    const error = await response.json().catch(() => ({ message: 'Une erreur est survenue' }));
    const errorMsg = Array.isArray(error.message) ? error.message.join(', ') : (error.message || 'Une erreur est survenue');
    throw new Error(errorMsg);
  }
  
  return response.json().catch(() => ({}));
}

export const api = {
  get: async (endpoint: string, options?: RequestInit) => fetchAPI(endpoint, { ...options, method: 'GET' }),
  post: async (endpoint: string, body?: any, options?: RequestInit) => fetchAPI(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: async (endpoint: string, body?: any, options?: RequestInit) => fetchAPI(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  patch: async (endpoint: string, body?: any, options?: RequestInit) => fetchAPI(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  delete: async (endpoint: string, options?: RequestInit) => fetchAPI(endpoint, { ...options, method: 'DELETE' }),
};
