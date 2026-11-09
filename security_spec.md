# Firestore Security Specification

## Data Invariants
1. A business document must exist for any subcollection data to be valid.
2. Users can only access data belonging to their assigned `businessId`.
3. Critical financial fields (dueAmount, stock) must be incremented/decremented correctly (though rules cannot fully enforce math logic without `increment`, they can enforce that non-admins don't overwrite with arbitrary large values).
4. `businessId` in a User document is immutable after creation.
5. Users cannot change their own roles.

## The "Dirty Dozen" Payloads

### 1. Identity Spoofing (Write to another business)
- **Path:** `businesses/other-biz/products/new-prod`
- **User:** Assigned to `main-business`
- **Expected:** `PERMISSION_DENIED`

### 2. Privilege Escalation (Self-assign Admin)
- **Path:** `users/my-user-id`
- **Payload:** `{ "role": "admin" }`
- **Expected:** `PERMISSION_DENIED`

### 3. Resource Poisoning (Giant ID)
- **Path:** `businesses/main-business/products/` + 'A'.repeat(1500)
- **Expected:** `PERMISSION_DENIED` (isValidId)

### 4. Shadow Field Injection
- **Path:** `businesses/main-business/sales/sale1`
- **Payload:** `{ "totalAmount": 100, "isVerifiedBySystem": true }` (Ghost field)
- **Expected:** `PERMISSION_DENIED` (strict schema)

### 5. PII Breach (Read other users)
- **Path:** `users/some-other-user-id`
- **User:** Non-admin
- **Expected:** `PERMISSION_DENIED`

### 6. Terminal State Bypass
- **Path:** `businesses/main-business/sales/completed-sale`
- **Action:** Update `totalAmount` on a finished sale.
- **Expected:** `PERMISSION_DENIED`

### 7. Orphaned Write (Product without Business)
- **Path:** `businesses/non-existent-biz/products/p1`
- **Expected:** `PERMISSION_DENIED` (exists check)

### 8. Immutable Field Mutation (CreatedAt)
- **Path:** `businesses/main-business/products/p1`
- **Payload:** `{ "createdAt": "2000-01-01" }`
- **Expected:** `PERMISSION_DENIED`

### 9. Price Manipulation (Negative Price)
- **Path:** `businesses/main-business/products/p1`
- **Payload:** `{ "sellingPrice": -100 }`
- **Expected:** `PERMISSION_DENIED`

### 10. Stock Poisoning (String in Number field)
- **Path:** `businesses/main-business/products/p1`
- **Payload:** `{ "stock": "lots" }`
- **Expected:** `PERMISSION_DENIED`

### 11. Cross-Business Query Scraping
- **Query:** `db.collectionGroup('products').where('price', '>', 0)`
- **Expected:** `PERMISSION_DENIED` (Missing business scope)

### 12. Unauthorized SMS Config Access
- **Path:** `businesses/main-business/config/sms`
- **User:** Staff member
- **Expected:** `PERMISSION_DENIED` (Only admins)

## Test Plan
- Implementation of `firestore.rules.test.ts` to verify these scenarios.
