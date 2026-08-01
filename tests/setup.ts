process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/delivery-test';
process.env.JWT_SECRET = 'test-only-secret-that-is-longer-than-thirty-two-characters';
process.env.MFA_ENCRYPTION_KEY = 'test-only-independent-mfa-encryption-secret';
process.env.SESSION_COOKIE_NAME = 'delivery_session';
process.env.REFRESH_COOKIE_NAME = 'delivery_refresh';
process.env.CSRF_COOKIE_NAME = 'delivery_csrf';
