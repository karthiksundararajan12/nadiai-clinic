/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure Noto Sans fonts ship with PDF-generating serverless functions.
  // Paths are relative to the project root (Next outputFileTracingIncludes).
  outputFileTracingIncludes: {
    "/api/scribe/sessions/[id]/prescription/review/approve": [
      "./features/booking/assets/fonts/**/*",
    ],
    "/api/webhooks/razorpay": [
      "./features/booking/assets/fonts/**/*",
    ],
  },
};

export default nextConfig;
