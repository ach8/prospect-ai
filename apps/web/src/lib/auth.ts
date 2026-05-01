import { api } from './api';

export const auth = {
  login: (data: any) => api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  googleLoginUrl: `${typeof window !== 'undefined' ? `http://${window.location.hostname}:4000/api/v1` : 'http://127.0.0.1:4000/api/v1'}/auth/google`,
};
