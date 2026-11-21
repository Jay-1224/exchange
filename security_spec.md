# NWS Stock Exchange — Security Specification

## 1. Data Invariants
1. **Admin Write Authority**: Only the verified bootstrap organizer (`ytscom1@gmail.com` with Google `email_verified == true`) or a Google-verified administrator provisioned in `admin_accounts/{uid}` may mutate `companies`, `market_settings`, `market_prices` (price ticks/overrides), `admin_accounts`, `audit_logs`, or disable/delete investors.
2. **Named Admin Password Monitor Mode**: Exhibition coordinators signing in with Admin Name + Password verify their SHA-256 `passwordHash` against `admin_accounts/adm_{slug}` to open the Admin Dashboard and 4-quadrant `/led` Live Market Board without requiring a Google account on TV screens.
3. **Public Market Read**: `companies`, `market_prices`, and `market_settings` are publicly readable so visitors see live market data without logging in.
4. **Investor Self-Registration Lock**: New investors register under deterministic IDs `investors/inv_{id}` strictly locked to `balance == 100000`, `initialBalance == 100000`, `isDisabled == false`, `lastTxId == ''`, and `createdAt == request.time`, storing only a SHA-256 `accessCodeHash` (never the raw access code).
5. **Atomic Trade Integrity**:
   - Trades (`BUY` / `SELL`) are rejected unless `market_settings/global.status == 'OPEN'`, the investor is not disabled, and the company `isActive == true`.
   - `transactions/{txId}` enforces `price` and `totalAmount` within `₹0.10` of the authoritative `market_prices/{symbol}.currentPrice * quantity`.
   - `investors/{uid}` balance updates require an atomic `existsAfter(/databases/$(database)/documents/transactions/$(incoming().lastTxId))` with exact balance debit (`BUY`) or credit (`SELL`) matching `totalAmount`, plus a distinct `lastTxId`.
   - `SELL` transactions verify `portfolios/{uid}_{symbol}` has `quantity >= incoming().quantity` before the write and `quantity == existing - incoming().quantity` after.
6. **No Plain-Text Credentials**: Access codes and admin passwords are never stored in plain text in Firestore or hardcoded in client source code.

## 2. Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated company mutation**: Unauthenticated user tries to write `/companies/TEST` -> DENIED (`isAdmin()`).
2. **Self-minting cash**: Investor updates `/investors/inv_nws1001` adding `balance: 9999999` without a matching atomic transaction -> DENIED.
3. **Custom initial balance on self-registration**: New investor tries to create `/investors/inv_nws9999` with `balance: 500000` -> DENIED (`incoming().balance == 100000`).
4. **Self-enabling disabled account**: Disabled investor sets `isDisabled: false` -> DENIED.
5. **Shadow field injection on portfolio**: Investor sets `{ ..., role: 'ADMIN' }` on `/portfolios/inv_nws1001_BMBL` -> DENIED (`keys().hasOnly()`).
6. **Price manipulation**: Non-admin updates `/market_prices/BMBL` setting `currentPrice: 1` -> DENIED (`affectedKeys().hasOnly(['volume', 'updatedAt'])`).
7. **Market closed trading**: Investor creates `/transactions/tx1` while `market_settings/global.status == 'PAUSED'` -> DENIED.
8. **Fake price transaction**: Investor creates `/transactions/tx1` with `price: 0.01` when `market_prices/BMBL.currentPrice == 1250` -> DENIED.
9. **Short-selling unowned shares**: Investor creates `SELL` transaction for 50 shares of `INDC` when holding 0 -> DENIED.
10. **Admin spoofing with unverified email**: User with `email_verified: false` tries to write `/companies/TEST` -> DENIED.
11. **ID poisoning**: Request with 500-char document ID `/transactions/<500chars>` -> DENIED (`isValidId`).
12. **Audit log tampering**: Any user (even admin) tries to `update` or `delete` `/audit_logs/log1` -> DENIED (immutable).
