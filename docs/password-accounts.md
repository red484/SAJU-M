# Web guest accounts

- “로그인 없이 이용하기” remains an anonymous cookie-based journal.
- “게스트 계정 만들기” generates a unique `guest-…` login ID; the user sets a 12–128 character password. This is not an email address or verified real-world identity.
- Account settings and the creation confirmation show the complete ID with a copy button. “아이디로 로그인” accepts this ID. Existing Google/Apple accounts still use their respective buttons, not an email/password form.
- Passwords use asynchronous salted scrypt (N=32768, r=8, p=1). Only hashes are stored. Cookie credentials remain HttpOnly and Secure on HTTPS. Anonymous journal cookies rotate after password authentication.
- Existing anonymous records migrate transactionally into the account. Re-login uses the same app user and therefore the same existing AI quota; password accounts do not disable the 5-answer quota.
- Password reset, recovery email and linking a guest account to an existing social account are **not implemented**. Do not promise recovery; the creation form requires acknowledgement of this limitation.
- Payments remain unavailable. The guest-account settings warning explains recovery risks; it is not an implemented payment gateway or checkout interception.
- This is web-only. The Apps-in-Toss build retains its existing authentication flow.

## Deployment and checks

The PostgreSQL backend applies `006_password_accounts.sql` on startup. Deploy the migration together with the server and web assets; the file-based development server cannot create accounts. No PostgreSQL extension or new package is required.

Run `npm test`, `npm run build`, and `TEST_DATABASE_URL=<disposable-local-database> node tests/password-postgres.test.mjs`. The integration test writes/deletes synthetic test accounts and must not be pointed at production.

The password endpoints conservatively limit attempts by transport peer (20 per 15 minutes), by login ID (10 per 15 minutes), and to two concurrent password operations. Behind a reverse proxy the peer limit is shared. Before increasing public traffic, configure a trusted-proxy-aware edge rate limit; do not blindly trust client-provided forwarding headers. In-memory limits reset on restart and are not shared between replicas.
