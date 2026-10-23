require('dotenv').config();

const { resolveDatabaseConfig } = require('./src/config/databaseEnv');

interface DBCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

interface Config {
  schema: string;
  out: string;
  dialect: string;
  dbCredentials: DBCredentials;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const database = resolveDatabaseConfig(nodeEnv, process.env);

const config: Config = {
  schema: './src/db/schemas/**/*.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: database.host,
    port: database.port,
    user: database.user,
    password: database.password,
    database: database.database,
  },
};

export default config;
