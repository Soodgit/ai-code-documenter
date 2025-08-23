// api/index.js
const app = require("../server");  // Import Express app
const serverless = require("serverless-http");

// Export the serverless function handler for Vercel
module.exports = serverless(app);
