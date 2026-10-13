import crypto from 'crypto';

/** Swagger UI for the REST API. Assets are pinned to an exact version on jsDelivr. */
const SWAGGER = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.15';

const INIT = `window.addEventListener('load', function () {
  window.ui = SwaggerUIBundle({
    url: '/api/v1/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 3,
    displayRequestDuration: true,
    filter: true,
    persistAuthorization: true,
    tryItOutEnabled: false,
    showExtensions: true,
    syntaxHighlight: { theme: 'monokai' },
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout'
  });
});`;

const STYLE = `
  body { margin: 0; background: #f6f8f9; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  .crr-bar { background: #0f172a; color: #fff; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #009689; }
  .crr-bar b { font-size: 16px; letter-spacing: .02em; } .crr-bar span { color: #94a3b8; font-size: 13px; margin-left: 10px; }
  .crr-bar a { color: #5eead4; font-size: 13px; text-decoration: none; margin-left: 18px; } .crr-bar a:hover { text-decoration: underline; }
  .swagger-ui .topbar { display: none; }
  .swagger-ui .info .title { color: #0f172a; }
  .swagger-ui .btn.authorize { color: #007a55; border-color: #007a55; } .swagger-ui .btn.authorize svg { fill: #007a55; }
  .swagger-ui .opblock-tag { color: #0f172a; }
  .swagger-ui .scheme-container { background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
`;

export function GET() {
  const hash = crypto.createHash('sha256').update(INIT).digest('base64');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>API documentation · CPGS Results Repository</title>
  <link rel="stylesheet" href="${SWAGGER}/swagger-ui.css" />
  <style>${STYLE}</style>
</head>
<body>
  <div class="crr-bar">
    <div><b>UNIZIK CPGS Results Repository</b><span>REST API v1</span></div>
    <div><a href="/api/v1/openapi.json">openapi.json</a><a href="/admin/api-keys">API keys</a><a href="/">Portal</a></div>
  </div>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER}/swagger-ui-bundle.js" crossorigin="anonymous"></script>
  <script src="${SWAGGER}/swagger-ui-standalone-preset.js" crossorigin="anonymous"></script>
  <script>${INIT}</script>
</body>
</html>`;
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://cdn.jsdelivr.net 'sha256-${hash}'`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: https://cdn.jsdelivr.net",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': csp,
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin',
      'cache-control': 'public, max-age=300',
    },
  });
}
