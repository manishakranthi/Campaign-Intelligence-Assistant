import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx (Meta's .xlsx parser) does a conditional top-level `require('./dist/cpexcel.js')` for
  // codepage support -- Next's automatic route-handler bundling can't statically trace that, so
  // the file silently gets dropped from the deployed serverless function (confirmed: it's fully
  // absent from .next/server/app/api/upload/route.js.nft.json without this). That's invisible in
  // `next dev`/local `next start`, which always read from the full local node_modules, but breaks
  // Meta file uploads specifically once deployed. Marking it external makes Next trace/ship the
  // whole package directory instead of only what static analysis can see.
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
