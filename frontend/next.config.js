/** @type {import("next").NextConfig} */

function apiOriginsForCsp() {
  const entries = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    (process.env.NEXT_PUBLIC_API_URL || "").trim(),
  ].filter(Boolean);

  const out = new Set(entries);
  for (const raw of entries) {
    try {
      const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      out.add(u.origin);
      if (u.protocol === "https:") {
        out.add(`wss://${u.host}`);
      } else if (u.protocol === "http:") {
        out.add(`ws://${u.host}`);
      }
    } catch {
      /* skip invalid */
    }
  }
  return [...out].join(" ");
}

const apiCspOrigins = apiOriginsForCsp();

const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "flagcdn.com" }],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              `img-src 'self' blob: data: https://flagcdn.com ${apiCspOrigins}`,
              `connect-src 'self' ws://127.0.0.1:8000 ws://localhost:8000 ${apiCspOrigins}`,
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
