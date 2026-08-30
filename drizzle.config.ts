require('dotenv').config();

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

const config: Config = {
  schema: './src/db/schemas/**/*.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'dira',
    password: process.env.DB_PASSWORD || 'dira',
    database: process.env.DB_DATABASE || 'dira',
  },
};

export default config;
