import { createECDH } from "node:crypto";

// Generate ONCE for a deployment and store only in Amvera secret variables.
// Never regenerate on every container start: old browser subscriptions would break.
const ecdh = createECDH("prime256v1");
const publicKey = ecdh.generateKeys().toString("base64url");
const privateKey = ecdh.getPrivateKey().toString("base64url");
console.log("WEB_PUSH_PUBLIC_KEY=" + publicKey);
console.log("WEB_PUSH_PRIVATE_KEY=" + privateKey);
console.log("WEB_PUSH_SUBJECT=mailto:YOUR_REAL_EMAIL@example.com");
console.log("\nSave these in Amvera environment variables. Keep the private key secret.");
