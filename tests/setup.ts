process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/delivery-test';
process.env.JWT_SECRET = 'test-only-secret-that-is-longer-than-thirty-two-characters';
process.env.MFA_ENCRYPTION_KEY = 'test-only-independent-mfa-encryption-secret';
process.env.SESSION_COOKIE_NAME = 'delivery_session';
process.env.REFRESH_COOKIE_NAME = 'delivery_refresh';
process.env.CSRF_COOKIE_NAME = 'delivery_csrf';
for (const variable of [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_MANAGEMENT_TOKEN', 'SUPABASE_PROJECT_REF',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'MONGODB_ATLAS_CLIENT_ID', 'MONGODB_ATLAS_CLIENT_SECRET', 'MONGODB_ATLAS_PROJECT_ID', 'MONGODB_ATLAS_CLUSTER_NAME',
  'VERCEL_ACCESS_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID',
  'LOCATIONIQ_TOKEN',
]) delete process.env[variable];
