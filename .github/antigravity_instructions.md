# **Clean Architecture + DDD Structure**

```
/project-root
  /app                 # Next.js App Router
    /api               # Backend API routes (Controllers layer)
      /dns
        add.ts
        update.ts
        delete.ts
        list.ts
  /domain              # Domain layer (Entities + Value Objects + Repositories Interfaces)
    /dns
      subdomain.ts     # Entity representing a subdomain
      record.ts        # Entity representing A/CNAME record
      types.ts         # Type definitions
      repository.ts    # Interface: DNS repository
  /application         # Use Cases (Services layer)
    /dns
      createSubdomain.ts
      updateSubdomain.ts
      deleteSubdomain.ts
      listSubdomains.ts
  /infrastructure      # Infrastructure layer (PowerDNS implementation + Firebase adapter)
    /dns
      pdnsRepository.ts
    /auth
      firebaseAuth.ts
  /lib                 # Helpers / Configs
    firebase.ts
    pdnsClient.ts
  /components          # UI Components
  /styles
```

---

## **Layer Responsibilities**

### **1. Domain Layer**

* Defines **entities**, **value objects**, **types**, and **repository interfaces**.
* Pure business rules, no framework or library dependencies.
* Example: `Subdomain` entity with `name`, `type`, `content`, `ownerId`, `ttl`.

---

### **2. Application Layer (Use Cases)**

* Implements **business logic** using domain entities and repository interfaces.
* Example: `createSubdomain` use case validates user limit, calls repository to add record.

---

### **3. Infrastructure Layer**

* Implements the repository interfaces using PowerDNS REST API.
* Implements authentication adapter using Firebase SDK.
* Can be swapped out later without touching domain or application layers.

---

### **4. API Layer (Controllers)**

* Next.js API routes.
* Convert HTTP requests to **Use Case calls**.
* Validate input minimally.
* Return HTTP response with status and data.

---

### **5. Dependency Rule**

* **API → Application → Domain → Infrastructure**
* Outer layers can depend on inner layers.
* Inner layers (Domain) do **not** depend on outer layers.

---

## **Example Flow (Add Subdomain)**

1. **HTTP Request**

   * POST `/api/dns/add`
   * Body: `{ name, type, content, ttl }`
   * Headers: `Authorization: FirebaseToken`

2. **Controller (API Route)**

   * Extract user UID from Firebase token.
   * Call `createSubdomain.execute({ name, type, content, ttl, ownerId })`.

3. **Use Case**

   * Validate max 5 subdomains per owner.
   * Validate type (A/CNAME), content (IP/hostname).
   * Call repository interface `dnsRepository.addRecord(subdomain)`.

4. **Infrastructure**

   * `pdnsRepository` implements `addRecord` via PowerDNS REST API.

5. **Domain**

   * `Subdomain` entity validates itself (name pattern, type, TTL range).

6. **Response**

   * Return HTTP 200 + record details, or 400/403 error.

---

## **Naming Conventions**

* Entities: PascalCase (`Subdomain`, `Record`)
* Repositories: `ISubdomainRepository`, `IPowerDNSRepository`
* Use Cases: `CreateSubdomain`, `UpdateSubdomain`
* API routes: kebab-case (`add.ts`, `update.ts`)
* Value Objects: PascalCase (`IPv4Address`, `Hostname`)

---

## **Advantages**

* **Testable:** Can unit-test domain/use cases without Next.js or PowerDNS.
* **Modular:** Swap Firebase or PowerDNS without touching business logic.
* **Readable:** Clean, small files, single responsibility per file.
* **DDD-compliant:** Domain rules central, persistence is secondary.




Very good, Master Sharif. Below I provide **official PowerDNS HTTP/REST API** endpoints relevant to zone & record operations — and **example usages** (curl + JSON) for each. Use these as reference in your backend.

---

## 🔗 Core PowerDNS API Endpoints & Usage

### 🔹 Base info

* The API is available via the built‑in webserver of PowerDNS (configured in `pdns.conf` with `api=yes`, `webserver=yes`, `webserver-address`, `webserver-port`, etc.) ([PowerDNS][1])
* All requests must include header `X-API-Key: <your‑api‑key>` for authentication. ([PowerDNS][1])
* Responses and requests use **JSON**. ([PowerDNS][1])

---

## ✅ Useful Endpoints & Examples

#### 1. List all zones

```
GET /api/v1/servers/localhost/zones
```

**Example:**

```bash
curl -H "X-API-Key: samsu-dns" \
     http://YOUR_PDNS_IP:8081/api/v1/servers/localhost/zones
```

Return: JSON array of zone objects. ([PowerDNS][2])

---

#### 2. Create a new zone

```
POST /api/v1/servers/localhost/zones
```

**Example:**

```bash
curl -X POST \
     -H "X-API-Key: samsu-dns" \
     -H "Content-Type: application/json" \
     http://YOUR_PDNS_IP:8081/api/v1/servers/localhost/zones \
     -d '{
           "name": "private.iishanto.com.",
           "kind": "Native",
           "masters": [],
           "nameservers": ["ns1.private.iishanto.com.", "ns2.private.iishanto.com."]
         }'
```

A trailing dot after zone name is required. On success, returns a JSON object describing the zone. ([PowerDNS][2])

---

#### 3. Add or update record(s) in a zone (A, CNAME, etc.)

```
PATCH /api/v1/servers/localhost/zones/{zone_name}
```

**Example — add / replace A record:**

```bash
curl -X PATCH \
  -H "X-API-Key: samsu-dns" \
  -H "Content-Type: application/json" \
  http://YOUR_PDNS_IP:8081/api/v1/servers/localhost/zones/private.iishanto.com. \
  -d '{
        "rrsets": [
          {
            "name": "sharif.private.iishanto.com.",
            "type": "A",
            "ttl": 3600,
            "changetype": "REPLACE",
            "records": [
              {
                "content": "104.0.1.112",
                "disabled": false
              }
            ]
          }
        ]
      }'
```

* For wildcard: use `"name": "*.private.iishanto.com."`.
* For CNAME: set `"type": "CNAME"` and `"content": "<target-domain>."`.

If successful, returns **204 No Content**. ([PowerDNS][2])

---

#### 4. Delete a record (RRSet) from a zone

```
PATCH /api/v1/servers/localhost/zones/{zone_name}
```

**Example — delete A record for subdomain:**

```bash
curl -X PATCH \
  -H "X-API-Key: samsu-dns" \
  -H "Content-Type: application/json" \
  http://YOUR_PDNS_IP:8081/api/v1/servers/localhost/zones/private.iishanto.com. \
  -d '{
        "rrsets": [
          {
            "name": "sharif.private.iishanto.com.",
            "type": "A",
            "changetype": "DELETE"
          }
        ]
      }'
```

Also returns 204 on success. ([PowerDNS][2])

---

#### 5. Delete entire zone (if needed)

```
DELETE /api/v1/servers/localhost/zones/{zone_name}
```

**Example:**

```bash
curl -X DELETE \
  -H "X-API-Key: samsu-dns" \
  http://YOUR_PDNS_IP:8081/api/v1/servers/localhost/zones/private.iishanto.com.
```

On success, returns **204 No Content**. ([PowerDNS][2])

---

## 📝 Summary — For Your Backend Implementation

* Use above endpoints to build CRUD operations on zones and records.
* Always include correct zone/record names **with trailing dot**.
* For adding/updating records: use `PATCH` + `rrsets` JSON.
* For deletions: `PATCH` with `changetype: "DELETE"`.
* Use consistent API key in header.

---

If you like, Master Sharif — I can assemble a compact **JavaScript module** (Node.js / fetch) that wraps these calls — you can drop it into your Next.js backend and use directly.

[1]: https://doc.powerdns.com/authoritative/http-api/?utm_source=chatgpt.com "Built-in Webserver and HTTP API — PowerDNS Authoritative Server documentation"
[2]: https://doc.powerdns.com/authoritative/http-api/zone.html?utm_source=chatgpt.com "Zones — PowerDNS Authoritative Server documentation"
