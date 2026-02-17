const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy requests to Cosmos DB to avoid CORS issues in development
  app.use(
    '/cosmos-api',
    createProxyMiddleware({
      target: 'https://audit.documents.azure.com:443',
      changeOrigin: true,
      secure: true,
      pathRewrite: {
        '^/cosmos-api': '', // Remove /cosmos-api prefix when forwarding
      },
      onProxyReq: (proxyReq, req, res) => {
        // Forward all headers
        console.log('Proxying Cosmos DB request:', req.url);
      },
      onError: (err, req, res) => {
        console.error('Cosmos DB Proxy Error:', err);
      }
    })
  );
};
