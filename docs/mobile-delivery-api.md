# Mobile Delivery API

Base URL:

```text
https://bawarchee.edunextg.co/api
```

For local development:

```text
https://bawarchee.edunextg.co/api
```

## Delivery Boy Credentials

Each delivery boy has:

- `delivery_login_id`: derived from DB id, for example id `1` becomes `BFPDB001`.
- `passcode`: random 6-digit numeric string.

Passcodes are stored hashed in `delivery_passcode_hash`. They are returned only once when a delivery boy is created or when credentials are regenerated from the CLI.

Generate credentials for existing delivery boys:

```bash
cd backend
npm run generate-delivery-credentials
npm run generate-delivery-credentials -- --reset
```

Admin can fetch delivery boys from:

```http
GET /delivery-boy
Authorization: Bearer <admin_token>
```

List responses include `delivery_login_id`, but never include passcodes.

Create delivery boy:

```http
POST /delivery-boy
Authorization: Bearer <admin_token>
Content-Type: application/json
```

```json
{
  "name": "Rahul",
  "contactNo": "9876543210",
  "companyIds": [1]
}
```

Success `201`:

```json
{
  "message": "Delivery Boy created successfully",
  "deliveryBoyId": 1,
  "deliveryLoginId": "BFPDB001",
  "passcode": "123456"
}
```

Save the passcode from this response. It is not returned again by list/profile APIs.

Generate or reset credentials for an existing delivery boy:

```http
POST /delivery-boy/:id/credentials
Authorization: Bearer <admin_token>
```

Success `200`:

```json
{
  "message": "Delivery Boy credentials generated successfully",
  "deliveryBoyId": 1,
  "deliveryLoginId": "BFPDB001",
  "passcode": "654321"
}
```

This replaces the old passcode. Save the new passcode from this response.

## Login

```http
POST /delivery-boy/mobile/login
Content-Type: application/json
```

Request:

```json
{
  "deliveryLoginId": "BFPDB001",
  "passcode": "123456"
}
```

Success `200`:

```json
{
  "message": "Login successful",
  "token": "jwt_token",
  "deliveryBoy": {
    "id": 1,
    "name": "Rahul",
    "contact_no": "9876543210",
    "delivery_login_id": "BFPDB001"
  }
}
```

Use the returned token for all mobile APIs:

```http
Authorization: Bearer <token>
```

## Profile

```http
GET /delivery-boy/mobile/profile
Authorization: Bearer <token>
```

Success `200`:

```json
{
  "id": 1,
  "name": "Rahul",
  "contact_no": "9876543210",
  "delivery_login_id": "BFPDB001",
  "company_name": "BAWARCHEE FOOD PACKAGING PRIVATE LIMITED",
  "company_ids": "1"
}
```

## Assigned Delivery Items

Fetch all items assigned to the logged-in delivery boy:

```http
GET /delivery-boy/mobile/items
Authorization: Bearer <token>
```

Optional filters:

```http
GET /delivery-boy/mobile/items?status=out_for_delivery
GET /delivery-boy/mobile/items?date=2026-06-10
GET /delivery-boy/mobile/items?status=delivered&date=2026-06-10
```

Allowed `status` filters:

- `out_for_delivery`
- `delivered`
- `cancelled`
- `returned`

Success `200`:

```json
[
  {
    "id": 25,
    "bp_sale_id": "BP25",
    "invoice_number": "INV-1001",
    "sale_date": "2026-06-10",
    "delivery_date": "2026-06-10",
    "item_count": 10,
    "packed_item_count": 10,
    "box_count": 2,
    "price": "1200.00",
    "packaging_status": "out_for_delivery",
    "vehicle_no": "WB01AB1234",
    "outlet_name": "ABC Store",
    "outlet_erp_id": "ERP001",
    "contact_number": "9876543210",
    "google_location": "https://maps.google.com/...",
    "staff_name": "Staff Name",
    "status_updated_at": "2026-06-10 14:30:00"
  }
]
```

`google_location` is the freshly captured delivery location saved against the
outlet/counter. After the location refresh rollout (requested September 25, 2026),
all older links are treated as unverified: this field is `null` until a delivery
person captures a new location for that outlet. Do not fall back to cached old
links; replace the mobile cache with the value from this API, including `null`.

## Save Outlet Location Once

```http
PUT /delivery-boy/mobile/items/:saleId/location
Authorization: Bearer <token>
Content-Type: application/json
```

Send the phone's current GPS coordinates while visiting the outlet:

```json
{ "latitude": 22.5726, "longitude": 88.3639 }
```

Success `200`:

```json
{
  "message": "Outlet location saved successfully",
  "sale": {
    "id": 25,
    "google_location": "https://www.google.com/maps/search/?api=1&query=22.5726,88.3639"
  }
}
```

The delivery must belong to the logged-in delivery boy and still be `out_for_delivery`.
Every outlet can receive one fresh capture after rollout, even if it already has
an old map link. After that capture, the new location cannot be overwritten through
this API, including by another delivery boy. A freshly saved
location, unavailable assignment, or inactive delivery returns `404`. Invalid or
missing coordinates return `400`.

Future deliveries to the same outlet receive the saved `google_location` in
`GET /delivery-boy/mobile/items`. Open that URL to show the outlet on Google Maps.
Show the save-location action only when `google_location` is empty, and capture
location before submitting the final delivery status.

Deployment: server startup automatically adds the nullable
`staff_counters.delivery_google_location` column; it can also be added with
`npm run update-schema` in the backend. Existing locations are not copied into
this column. The reset happens once when this feature is deployed, not daily or
on server restart. New captures update both the regular outlet map link and the
delivery map link. Later edits/imports of the regular map link do not replace the
delivery capture.

## Update Outlet Contact Number

```http
PUT /delivery-boy/mobile/items/:saleId/contact
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{ "contactNumber": "9876543210" }
```

Success `200`:

```json
{
  "message": "Outlet contact number updated successfully",
  "sale": { "id": 25, "contact_number": "9876543210" }
}
```

`contactNumber` must be a string containing 1 to 20 digits (surrounding spaces are
trimmed). Missing, empty, or invalid values return `400`. Only the delivery boy
assigned to an `out_for_delivery` item can update its outlet; otherwise the API
returns `404`. Update the number before submitting the final delivery status.

Unlike location, the contact number can be corrected more than once. The updated
number is stored on the outlet and returned as `contact_number` for all future
deliveries to that outlet. Updating the contact number does not change its location.

## Cancel a Delivery

Cancellation is supported by the existing status API:

```http
PUT /delivery-boy/mobile/items/:saleId/status
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "status": "cancelled",
  "cancellationReason": "Outlet is closed"
}
```

The reason is required; a missing or blank reason returns `400`. Only the
assigned delivery boy can cancel a delivery while it is `out_for_delivery`.
An unavailable assignment returns `404`; an already submitted delivery returns
`409`.

Success `200`:

```json
{
  "message": "Delivery status updated successfully",
  "sale": {
    "id": 25,
    "packaging_status": "cancelled",
    "delivery_cancelled": true
  }
}
```

Cancellation retains the delivery person and delivery date so the item remains
visible in `GET /delivery-boy/mobile/items?status=cancelled`, including with a
`date` filter. Remove it from the active list after success and refresh the
cancelled list. List responses include `cancellation_reason`. The saved outlet
location and contact number remain available for future deliveries.

Previously cancelled items whose assignment was cleared cannot be recovered in
the delivery person's list automatically; their original assignee is no longer
stored on the order.

## Update Delivery Status

Delivery boy can update only items assigned to his own profile and only while the item is still `out_for_delivery`. Once marked `delivered`, `cancelled`, or `returned`, the mobile app cannot change the status again.

```http
PUT /delivery-boy/mobile/items/:saleId/status
Authorization: Bearer <token>
Content-Type: application/json
```

Request:

```json
{
  "status": "delivered"
}
```

Allowed status values:

- `delivered`
- `cancelled`
- `returned`

Success `200`:

```json
{
  "message": "Delivery status updated successfully",
  "sale": {
    "id": 25,
    "bp_sale_id": "BP25",
    "invoice_number": "INV-1001",
    "sale_date": "2026-06-10",
    "delivery_date": "2026-06-10",
    "item_count": 10,
    "packed_item_count": 10,
    "box_count": 2,
    "price": "1200.00",
    "packaging_status": "delivered",
    "vehicle_no": "WB01AB1234",
    "outlet_name": "ABC Store",
    "outlet_erp_id": "ERP001",
    "contact_number": "9876543210",
    "google_location": "https://maps.google.com/...",
    "staff_name": "Staff Name",
    "status_updated_at": "2026-06-10 15:05:00"
  }
}
```

Common errors:

```json
{ "error": "Invalid delivery login ID or passcode" }
```

```json
{ "error": "Assigned delivery item not found" }
```

```json
{ "error": "Status must be delivered, cancelled, or returned" }
```

```json
{
  "error": "This delivery has already been submitted and cannot be changed.",
  "packaging_status": "delivered"
}
```
