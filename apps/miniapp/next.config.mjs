/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@m/shared"],
  env: { API_URL: process.env.API_URL ?? "http://localhost:3001" },
};
