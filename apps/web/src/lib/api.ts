const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes('localhost')) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined') {
    return `http://${window.location.hostname}:4000/api/v1`;
  }
  return 'http://127.0.0.1:4000/api/v1';
};

const API_URL = getApiUrl();

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
    throw new Error(error.message || 'Une erreur est survenue');
  }
  
  return response.json().catch(() => ({}));
}

export const api = {
  get: async (endpoint: string, options?: RequestInit) => fetchAPI(endpoint, { ...options, method: 'GET' }),
  post: async (endpoint: string, body?: any, options?: RequestInit) => fetchAPI(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
};
