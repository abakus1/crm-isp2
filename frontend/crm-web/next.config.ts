import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://193.25.2.2:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
};