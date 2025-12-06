# OpenSubdomain Platform

A lightweight, modern subdomain management platform built with Next.js, Firebase, and PowerDNS. Optimized for minimal resource usage (200MB RAM excluding Node.js).

## Features

- 🚀 **Fast & Lightweight** - Minimal dependencies, optimized for low memory usage
- 🎨 **Modern Design** - Glassmorphic UI with smooth animations
- 🔒 **Secure** - Firebase Authentication, server-side API key protection
- ⚡ **Real-time** - Instant subdomain availability checking
- 🔧 **Automatic DNS** - PowerDNS integration for automatic record creation
- 📱 **Responsive** - Mobile-first design, works on all devices

## Tech Stack

- **Framework:** Next.js 14 with React 18
- **Database:** Firebase Firestore (serverless)
- **Authentication:** Firebase Authentication
- **DNS:** PowerDNS HTTP/REST API
- **Styling:** Vanilla CSS with CSS Modules (no framework overhead)

## Prerequisites

- Node.js 18+ installed
- Firebase project with Firestore and Authentication enabled
- PowerDNS server with HTTP API enabled
- Parent domain configured in PowerDNS

## Installation

### 1. Clone and Install

```bash
cd opensubdomain
npm install
```

### 2. Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com/
2. Enable **Firestore Database** (start in production mode)
3. Enable **Authentication** > Email/Password
4. Create an admin user in Authentication
5. Go to **Project Settings** > Service Accounts
6. Generate new private key (download JSON)

### 3. Firestore Security Rules

Deploy these security rules in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /subdomains/{subdomainId} {
      // Allow read for anyone
      allow read: if true;
      
      // DENY all writes from client
      // All writes go through Next.js API routes
      allow write: if false;
    }
  }
}
```

Create composite index for querying:
- Collection: `subdomains`
- Fields: `subdomainName` (Ascending), `createdAt` (Descending)

### 4. Environment Configuration

Create `.env.local` file:

```env
# Firebase Client (public - safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Firebase Admin SDK (server-side ONLY - never expose)
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

# PowerDNS Configuration (server-side ONLY)
POWERDNS_API_URL=http://YOUR_PDNS_IP:8081
POWERDNS_API_KEY=your-api-key
POWERDNS_ZONE=yourdomain.com.
DEFAULT_DNS_TARGET_IP=104.0.1.112

# Application
NEXT_PUBLIC_PARENT_DOMAIN=yourdomain.com
```

**Important:** Replace `yourdomain.com` with your actual domain. The POWERDNS_ZONE must end with a dot (`.`).

### 5. PowerDNS Configuration

Ensure PowerDNS API is enabled in `pdns.conf`:

```ini
api=yes
api-key=your-api-key
webserver=yes
webserver-address=0.0.0.0
webserver-port=8081
webserver-allow-from=YOUR_NEXTJS_SERVER_IP
```

Create the parent zone in PowerDNS:

```bash
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  http://YOUR_PDNS_IP:8081/api/v1/servers/localhost/zones \
  -d '{
    "name": "yourdomain.com.",
    "kind": "Native",
    "masters": [],
    "nameservers": ["ns1.yourdomain.com.", "ns2.yourdomain.com."]
  }'
```

## Development

```bash
npm run dev
```

Open http://localhost:3000

## Production Build

```bash
# Build
npm run build

# Start production server
npm start
```

### Memory Limit

Run with 200MB memory limit:

```bash
node --max-old-space-size=200 node_modules/next/dist/bin/next start
```

## Usage

### User Flow

1. Visit homepage
2. Enter desired subdomain name
3. Check real-time availability
4. Choose record type (A or CNAME)
5. Enter target IP/domain
6. Submit request
7. Wait for admin approval

### Admin Flow

1. Navigate to `/admin/login`
2. Sign in with Firebase credentials
3. View all subdomain requests
4. Filter by status (pending/approved/rejected)
5. Approve/reject requests
   - **On approval:** DNS record automatically created via PowerDNS API
   - **DNS status** displayed in table
6. Delete subdomains (also removes DNS records)

## API Endpoints

All API routes are server-side only and protected by authentication where needed.

### Public Endpoints

- `GET /api/subdomains/check?name={subdomain}` - Check availability

### Admin Endpoints (requires Authentication header)

- `GET /api/subdomains` - List all subdomains (paginated)
- `GET /api/subdomains/:id` - Get specific subdomain
- `POST /api/subdomains` - Create subdomain request (rate-limited)
- `PATCH /api/subdomains/:id` - Update status (triggers DNS creation)
- `DELETE /api/subdomains/:id` - Delete subdomain (removes DNS)

## Security

- ✅ All PowerDNS API calls server-side only
- ✅ Firebase Admin SDK server-side only
- ✅ Firestore security rules prevent client writes
- ✅ Rate limiting on subdomain requests
- ✅ Input validation and sanitization
- ✅ Firebase Auth token verification

## Memory Optimization

- Minimal dependencies (~150MB total)
- No CSS framework (vanilla CSS)
- SWC minification enabled
- Code splitting and tree-shaking
- Static generation where possible
- No source maps in production

## Troubleshooting

### DNS Creation Fails

Check `dnsError` field in Firestore:
- Verify PowerDNS API URL and key
- Check PowerDNS logs: `journalctl -u pdns -f`
- Ensure zone exists and has trailing dot
- Verify network connectivity

### Firebase Connection Issues

- Check Firebase project settings
- Verify private key format (newlines as `\n`)
- Ensure Firestore indexes created
- Check Firebase Authentication enabled

### Build Errors

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
```

### VPS/Server

```bash
# Build
npm run build

# Use PM2 for process management
npm i -g pm2
pm2 start npm --name "opensubdomain" -- start

# With memory limit
pm2 start npm --name "opensubdomain" --node-args="--max-old-space-size=200" -- start
```

## License

MIT

## Support

For issues and questions, please create an issue in the repository.
