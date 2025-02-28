const http = require('http');
const app = require('./app');



// Define the port number
const port = process.env.PORT || 3000; // If port is not defined in env variable than assign it 3000

const server = http.createServer(app);

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});