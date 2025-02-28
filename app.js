const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const helmet = require('helmet');
const path = require('path')
const cors = require('cors');
require('dotenv').config()
const apiPath = require('./api/routes/index')

const corsOptions = {
    origin: true, // This allows all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions));

app.use(bodyParser.json());
app.use(helmet.frameguard({ action: 'deny' }));

app.use((req, res, next) => {
    req.headers['x-forwarded-for'] = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'];
    next();
});

//App routes here
app.use(apiPath)

// Handle if request URL is not found
app.use((req, res, next) => {
    res.status(404).json({
        status: 'not_found',
        message: "The requested endpoint does not exist."
    });
});

// Handle all kind of errors
app.use((error, req, res, next) => {
    console.error(error); // Log the error for debugging
    res.status(500).json({
        status: 'internal_error',
        message: 'An unexpected error occurred. Please try again later or contact support if the problem persists.'
    });
});

module.exports = app;