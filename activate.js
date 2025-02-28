const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const axios = require('axios');

async function fetchDatabaseSchema() {
    try {
        const response = await axios.post('https://starterappkit.com/api/activate', {
          license_key: process.env.LICENSE_KEY
        });
        
        const data = response.data;
        console.log('✓ Schema fetched successfully');
        return data.database;
      } catch (error) {
        if (error.response) {
          const errorMessage = error.response.data.message || 'An unknown error occurred';
          console.error('❌ API Error:', errorMessage);
          throw new Error(errorMessage);
        } else if (error.request) {
          console.error('❌ Network Error: No response received');
          throw new Error('Failed to connect to the server');
        } else {
          console.error('❌ Request Error:', error.message);
          throw new Error('Failed to make request');
        }
      }
}

async function activate() {
    try {
        // Load environment variables
        dotenv.config();

        const dbConfig = {
            port: 8889,
            host: process.env.DB_SERVER || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
        };

        console.log('📥 Activating your License and Fetching database schema...');
        const schema = await fetchDatabaseSchema();
        console.log(`Schema version: ${schema.version}`);

        console.log('\n📦 Attempting database connection...');
        
        // Connect to MySQL server
        let connection;
        try {
            connection = await mysql.createConnection(dbConfig);
            console.log('✓ Connected to MySQL server');
        } catch (err) {
            console.error('❌ Failed to connect to MySQL server:');
            console.error('Error:', err.message);
            console.error('\nPlease check:');
            console.error('1. MySQL server is running');
            console.error('2. Credentials in .env are correct');
            console.error('3. MySQL server is running on the specified port');
            process.exit(1);
        }

        // Create database
        try {
            const dbName = process.env.DB_NAME || 'starterapp';
            await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
            console.log(`✓ Database "${dbName}" created/verified`);
            
            await connection.query(`USE ${dbName}`);
            console.log(`✓ Now using database "${dbName}"`);

        } catch (err) {
            console.error('❌ Failed to create/use database:');
            console.error('Error:', err.message);
            process.exit(1);
        }

        // Create tables from fetched schema
        try {
            console.log('\nCreating tables...');
            for (const table of schema.tables) {
                await connection.query(table.sql);
                console.log(`✓ ${table.name} table created`);
            }
        } catch (err) {
            console.error('❌ Failed to create tables:');
            console.error('Error:', err.message);
            process.exit(1);
        }

        await connection.end();
        console.log('\n✅ Database setup completed successfully!');

    } catch (error) {
        console.error('\n❌ Setup failed with error:');
        console.error(error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    activate();
}