const mysql = require('mysql2');
// Define connection globally to use it anywhere in this project
const pool = mysql.createPool({
    connectionLimit : 10,
    host: process.env.DB_SERVER,
    port: 8889, //Conditional
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    debug: false,

});


module.exports = pool;