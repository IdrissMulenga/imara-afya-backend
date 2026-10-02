//Placeholder settings so modules that load src/config/env.ts can be imported in unit tests.
//Tests never connect to the database.
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/imara-afya-test';
process.env.JWT_SECRET ??= 'unit-test-secret-that-is-at-least-32-characters';
