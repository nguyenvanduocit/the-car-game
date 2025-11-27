/**
 * Production static file server using Bun.serve()
 * Serves built files from dist/ directory
 */

const server = Bun.serve({
  port: 7000,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname;

    // Default to index.html for root
    if (filePath === '/') {
      filePath = '/index.html';
    }

    // Try to serve the file from dist directory
    const file = Bun.file(`./dist${filePath}`);

    // Check if file exists
    const exists = await file.exists();

    if (exists) {
      return new Response(file);
    }

    // For SPA: return index.html for all non-file routes
    // This handles client-side routing
    if (!filePath.includes('.')) {
      const indexFile = Bun.file('./dist/index.html');
      return new Response(indexFile);
    }

    // File not found
    return new Response('Not Found', { status: 404 });
  },
  development: false,
});

console.log(`🚀 Static file server running at http://localhost:${server.port}`);
console.log(`📁 Serving files from: ./dist`);
