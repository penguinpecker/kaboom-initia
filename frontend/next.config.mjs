/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // InterwovenKit ships ESM-only for some of its sub-deps.
  transpilePackages: [
    "@initia/interwovenkit-react",
    "@initia/utils",
    "@initia/amino-converter",
  ],
};

export default nextConfig;
