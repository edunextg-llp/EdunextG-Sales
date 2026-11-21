# Maintenance Mode API

One switch for the whole site:

| status | Meaning |
|---|---|
| `1` | Working (normal) |
| `0` | Under maintenance: every API except `/api/maintenance/*` answers `503`, and the main site and Sales & Purchase show the "Server under maintenance" screen |

Changing the status needs the admin Login ID + password **and** a 6-digit OTP. The OTP is mailed to the address in `backend/.env`:

```env
MAINTENANCE_OTP_MAIL_TO=your-otp-inbox@example.com
```

(It is sent from `OTP_MAIL_USER`. Restart the backend after changing `.env`.)

**Base URL**

| Where | Base URL |
|---|---|
| Local | `http://localhost:2002` |
| Live | `https://<your-site>` (the same address the website uses for `/api`) |

A ready-made Postman collection is in `docs/Maintenance.postman_collection.json` (Postman → Import).

---

## Steps at a glance

1. `POST /api/maintenance/request-otp`: send the admin Login ID + password. You get an `otpSessionId`, and the OTP arrives by mail.
2. `POST /api/maintenance/status`: send `otpSessionId` + `otp` + `status` (`0` = maintenance ON, `1` = OFF).
3. `GET /api/maintenance/status`: check the current status at any time.

Each OTP works **once** and expires in **10 minutes**. To switch again (for example, back to `1`), repeat steps 1 and 2.

---

## 1. Request OTP

Checks the admin login and mails the OTP.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/api/maintenance/request-otp` |

**Headers**

| Key | Value |
|---|---|
| `Content-Type` | `application/json` |

**Body** (Postman: Body → raw → JSON)

```json
{
  "loginId": "admin@example.com",
  "password": "your-admin-password"
}
```

| Field | Required | Notes |
|---|---|---|
| `loginId` | Yes | The admin Login ID (the email you sign in with) |
| `password` | Yes | The admin password |

**Success: `200 OK`**

```json
{
  "message": "OTP sent to yo******@example.com. Send it to POST /api/maintenance/status with status 0 (maintenance) or 1 (working).",
  "otpSessionId": "6f1c2a3b-8d4e-4f5a-9b6c-7d8e9f0a1b2c",
  "sentTo": "yo******@example.com",
  "expiresInSeconds": 600
}
```

Copy `otpSessionId`; you need it in step 2. The Postman collection saves it for you.

**Errors**

| Code | Body `error` | Why |
|---|---|---|
| `400` | `loginId and password are required.` | A field is missing |
| `401` | `Wrong admin Login ID or password.` | Wrong login |
| `429` | `Too many wrong attempts. Try again after 15 minutes.` | 5 wrong passwords from this computer |
| `500` | `MAINTENANCE_OTP_MAIL_TO is not set in backend/.env.` | The OTP inbox isn't set |
| `502` | `Could not send the OTP email. Please try again later.` | The email could not be sent |

---

## 2. Turn maintenance ON or OFF

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{{baseUrl}}/api/maintenance/status` |

**Headers**

| Key | Value |
|---|---|
| `Content-Type` | `application/json` |

### 2a. Maintenance ON (site offline): `status: 0`

**Body**

```json
{
  "otpSessionId": "6f1c2a3b-8d4e-4f5a-9b6c-7d8e9f0a1b2c",
  "otp": "482913",
  "status": 0,
  "message": "We are updating the server. Back by 6 PM."
}
```

**Success: `200 OK`**

```json
{
  "message": "Maintenance is ON. The websites now show the maintenance screen.",
  "status": 0,
  "maintenance": true,
  "maintenanceMessage": "We are updating the server. Back by 6 PM.",
  "updatedBy": "admin@example.com"
}
```

### 2b. Maintenance OFF (site working): `status: 1`

First request a new OTP (step 1), then send:

**Body**

```json
{
  "otpSessionId": "0a9b8c7d-6e5f-4a3b-2c1d-0e9f8a7b6c5d",
  "otp": "150376",
  "status": 1
}
```

**Success: `200 OK`**

```json
{
  "message": "Maintenance is OFF. Everything works again.",
  "status": 1,
  "maintenance": false,
  "maintenanceMessage": "",
  "updatedBy": "admin@example.com"
}
```

| Field | Required | Notes |
|---|---|---|
| `otpSessionId` | Yes | From step 1 |
| `otp` | Yes | The 6-digit code from the email (send it as text, e.g. `"012345"`, so a leading 0 is kept) |
| `status` | Yes | `0` = maintenance ON, `1` = maintenance OFF |
| `message` | No | Text shown on the maintenance screen (up to 1000 characters). If you leave it out: "The server is under maintenance. Please try again after some time." |

**Errors**

| Code | Body `error` | Why |
|---|---|---|
| `400` | `status must be 0 (maintenance) or 1 (working).` | `status` is missing or not 0/1 |
| `400` | `otpSessionId and otp are required.` | A field is missing |
| `401` | `Incorrect OTP. 4 attempt(s) left.` | Wrong OTP |
| `401` | `Too many wrong OTPs. Call request-otp again.` | 5 wrong OTPs; that OTP is cancelled |
| `401` | `OTP expired or not requested. Call request-otp again.` | More than 10 minutes passed, the OTP was already used, or the backend restarted |

---

## 3. Check status

Public: no login, no OTP.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{{baseUrl}}/api/maintenance/status` |

**Headers:** none needed. **Body:** none.

**Response: `200 OK`**

Working:

```json
{ "status": 1, "maintenance": false, "message": "", "updatedAt": "2026-11-20 15:33:37" }
```

Under maintenance:

```json
{ "status": 0, "maintenance": true, "message": "We are updating the server. Back by 6 PM.", "updatedAt": "2026-11-20 15:33:30" }
```

---

## What other APIs return during maintenance

Every other `/api/...` call answers:

**`503 Service Unavailable`**

Headers: `X-Maintenance: 1`, `Retry-After: 300`

```json
{
  "code": "MAINTENANCE",
  "maintenance": true,
  "status": 0,
  "error": "We are updating the server. Back by 6 PM.",
  "message": "We are updating the server. Back by 6 PM."
}
```

The websites react to this on their own:

- They show the maintenance screen straight away.
- While it shows, they check every 15 seconds and close the screen by themselves when the status is back to `1`.
- The page stays loaded underneath, so a half-filled form isn't lost.

The staff mobile app and the distributor portal get the same `503` error, but have no maintenance screen.

---

## Same thing with curl

```bash
# 1. Request OTP
curl -X POST http://localhost:2002/api/maintenance/request-otp \
  -H "Content-Type: application/json" \
  -d '{"loginId":"admin@example.com","password":"your-admin-password"}'

# 2. Maintenance ON
curl -X POST http://localhost:2002/api/maintenance/status \
  -H "Content-Type: application/json" \
  -d '{"otpSessionId":"<from step 1>","otp":"<from email>","status":0,"message":"Back by 6 PM."}'

# 2. Maintenance OFF (after a new OTP)
curl -X POST http://localhost:2002/api/maintenance/status \
  -H "Content-Type: application/json" \
  -d '{"otpSessionId":"<from step 1>","otp":"<from email>","status":1}'

# 3. Check
curl http://localhost:2002/api/maintenance/status
```
