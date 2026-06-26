# Security fix plan

Applied automatically:

- Added `middleware.ts` to protect `/admin/*` routes except login/logout.
- Added `.env.example` with required environment keys.
- Added `lib/rateLimit.ts` helper for login throttling.

Still recommended:

- Wire `lib/rateLimit.ts` into admin login and client login.
- Store admin password as a one-way hash instead of plaintext Setting value.
- Make public booking creation transactional and protect against double booking.
- Move client session from URL token to cookie session when the client logs in.
- Add tests for admin access, booking conflicts, and blocked windows.
