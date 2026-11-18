import nextVitals from "eslint-config-next/core-web-vitals";
export default [
  ...nextVitals,
  { ignores: [".next/**", "node_modules/**"] },
  // Native links preserve the existing full-navigation and draft-warning flow.
  { rules: { "@next/next/no-img-element": "off", "@next/next/no-html-link-for-pages": "off" } }
];
