import axios from 'axios';

let initialized = false;

export function setupAxiosAuth() {
  if (initialized) {
    return;
  }

  axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('aegis_token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  initialized = true;
}
