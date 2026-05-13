// API Configuration for Techniti ERPNext
// Your computer IP: 192.168.29.235
// Your phone MUST be on the same WiFi network as the server
export const API_BASE_URL = __DEV__
  ? 'http://192.168.29.235:8000/api'   // Local Frappe server (dev)
  : 'http://192.168.2r9.235:8000/api';  // Update to production URL when deploying

// pfc.local is the default_site in common_site_config.json
// Since it's the default, no Host header override is needed — all requests hit it directly
export const SITE_NAME = 'pfc.local';
