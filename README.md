# Carely Caregiver Backend 🚀

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-5.2-blue.svg)](https://expressjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209.2-green.svg)](https://mongoosejs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-black.svg)](https://socket.io/)
[![Stripe](https://img.shields.io/badge/Stripe-API%20v20-6772E5.svg)](https://stripe.com/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

Carely is a production-grade, enterprise-ready backend RESTful and Real-Time API engine built for a modern Caregiver Marketplace. It connects **Clients** (and their **Care Recipients**) with certified, background-checked **Caregivers**, managed by comprehensive **Admin** tooling.

The platform orchestrates end-to-end booking workflows with atomic calendar slot locking, Stripe payment checkout sessions, multi-channel notifications (Push, Socket.IO, Email), real-time 1-on-1 messaging, background document verification, automated hold-expiration crons, and automated rating/earning ledgers.

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Tech Stack & Dependencies](#-tech-stack--dependencies)
- [Project Directory Structure](#-project-directory-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Configuration](#environment-configuration)
  - [Running the Application](#running-the-application)
- [Database Seeding](#-database-seeding)
- [API Documentation & Swagger](#-api-documentation--swagger)
- [Core API Routes Reference](#-core-api-routes-reference)
  - [Authentication & OAuth](#authentication--oauth)
  - [User Management](#user-management)
  - [Caregiver Profiles & Directory](#caregiver-profiles--directory)
  - [Client Profiles & Care Recipients](#client-profiles--care-recipients)
  - [Availability & Slot Management](#availability--slot-management)
  - [Bookings & Lifecycle](#bookings--lifecycle)
  - [Payments & Stripe Webhook](#payments--stripe-webhook)
  - [Earnings & Payouts](#earnings--payouts)
  - [Real-time Conversations & Messaging](#real-time-conversations--messaging)
  - [Reviews & Ratings](#reviews--ratings)
  - [Verification Documents](#verification-documents)
  - [Admin Platform Operations](#admin-platform-operations)
  - [CMS Pages](#cms-pages)
- [Real-Time Socket.IO Engine](#-real-time-socketio-engine)
- [Scheduled Cron Jobs](#-scheduled-cron-jobs)
- [Standardized API Response & Error Handling](#-standardized-api-response--error-handling)
- [Security & Performance](#-security--performance)
- [Deployment & Production Recommendations](#-deployment--production-recommendations)
- [Author & License](#-author--license)

---

## 🏗 System Architecture

```mermaid
flowchart TD
    ClientApp["Client App (Web / Mobile)"]
    CaregiverApp["Caregiver App (Web / Mobile)"]
    AdminPanel["Admin Dashboard"]

    subgraph Carely_API_Gateway ["Carely Express 5 & Socket.IO Engine"]
        Middlewares["Helmet | CORS | RateLimiter | Morgan | Auth Guards"]
        Router["Express Modular Router (/api/v1)"]
        SocketEngine["Socket.IO Server (Rooms & Handlers)"]
        CronService["node-cron (30-min Auto Release)"]
    end

    subgraph Data_Storage ["Database & Persistence"]
        MongoDB[("MongoDB (Mongoose)")]
        Uploads[("Local File Storage (/uploads)")]
    end

    subgraph External_Services ["Third-Party Integrations"]
        StripeAPI["Stripe Payments & Webhooks"]
        GoogleOAuth["Google OAuth 2.0 (Passport)"]
        FCM["Firebase Cloud Messaging (FCM)"]
        SMTP["SMTP Mail Server (Nodemailer)"]
    end

    ClientApp -->|HTTP/REST| Middlewares
    CaregiverApp -->|HTTP/REST| Middlewares
    AdminPanel -->|HTTP/REST| Middlewares

    ClientApp <-->|WebSocket| SocketEngine
    CaregiverApp <-->|WebSocket| SocketEngine

    Middlewares --> Router
    Router --> MongoDB
    Router --> Uploads
    Router --> StripeAPI
    Router --> GoogleOAuth
    Router --> FCM
    Router --> SMTP
    Router --> SocketEngine
    CronService --> MongoDB
```

---

## ✨ Key Features

### 1. Role-Based Access Control (RBAC)
- Support for three primary roles: `ADMIN`, `CLIENT`, and `CAREGIVER`.
- Strict middleware enforcement via `checkAuth(...)` validating JWT access tokens.
- Account status tracking (`active`, `inactive`, `suspended`, `blocked`) and document verification tiers (`unverified`, `pending`, `verified`, `rejected`).

### 2. Multi-Method Authentication
- Standard email/password registration with bcrypt salt rounds (12).
- Google OAuth 2.0 authentication (`passport-google-oauth20`) with automatic onboarding path redirection.
- Dual-token lifecycle: short-lived JWT Access Tokens and secure HTTP-Only Refresh Tokens.
- OTP email verification for registration, password recovery, and credential modification.

### 3. Caregiver Lifecycle & Verification
- Profile creation with specialties (linked to categories), hourly rate, experience, bio, languages, and geographic coordinates.
- Document upload workflow (government ID, certifications, background checks) with optional verification fee checkout via Stripe.
- Admin review portal for document validation, caregiver badge toggling, and account approval.

### 4. Client & Care Recipient Management
- Dedicated client profile with emergency contacts and address management.
- Multi-recipient sub-profiles: register family members or dependents requiring care, including medical notes, mobility requirements, and avatar images.

### 5. Atomic Booking & Shift Scheduling
- Shift types: `MORNING`, `AFTERNOON`, `EVENING`, and `NIGHT`.
- Dynamic slot locking using MongoDB ACID transactions to prevent double booking.
- 30-minute temporary hold (`HELD`) when a client initiates a checkout.
- Background worker automatically releases expired holds back to `AVAILABLE`.
- Booking status progression: `PENDING` ➔ `CONFIRMED` ➔ `COMPLETED` (or `DECLINED` / `CANCELLED` / `AUTO_RELEASED`).
- Client cancellation handling with automated partial refund calculations (90% refund, 10% platform fee).

### 6. Stripe Payment Processing & Earnings Ledger
- Pre-built Stripe Checkout Session generator for bookings and verification payments.
- Secure raw body webhook listener (`/webhook/stripe`) processing checkout completions and refunds.
- Caregiver earnings tracking with status transition (`PENDING` ➔ `HELD` ➔ `RELEASED`).
- Configurable platform commission deduction (default 15%).
- Admin payout release controls with payout method recording.

### 7. Real-Time Chat & Socket.IO Presence
- 1-on-1 private messaging between clients and caregivers with media attachments.
- Typing indicators (`typing:start`, `typing:stop`).
- Real-time message status updates (`message:delivered`, `message:seen`).
- Live user online/offline status broadcast (`user:online`, `user:offline`).
- Instant socket push for booking updates and in-app alerts.

### 8. Tri-Layer Notification Pipeline
Every critical business event is simultaneously dispatched through:
1. **Persistent Layer**: Stored in MongoDB for inbox review.
2. **Real-Time Layer**: Delivered immediately to active user Socket.IO rooms.
3. **Push Layer**: Delivered to background mobile devices via Firebase Cloud Messaging (FCM).
4. **Email Layer**: High-priority events (bookings, OTPs, cancellations) dispatch responsive HTML templates via SMTP.

### 9. Advanced Query Builder
All listing endpoints feature server-side:
- Full-text search across customizable fields (`searchTerm`)
- Strict and range filtering (`minPrice`, `maxPrice`, `minRating`, `dateRange`)
- Dynamic sorting (`sort=-createdAt`, `sort=hourlyRate`)
- Field selection (`fields=name,email,avatar`)
- Pagination with detailed metadata (`page`, `limit`, `total`, `totalPage`)

---

## 🛠 Tech Stack & Dependencies

| Category | Technology |
| :--- | :--- |
| **Runtime & Language** | [Node.js](https://nodejs.org/) (v18+), [TypeScript](https://www.typescriptlang.org/) (v5.9+) |
| **Web Framework** | [Express.js](https://expressjs.com/) (v5.2.1) |
| **Database & ODM** | [MongoDB](https://www.mongodb.com/), [Mongoose](https://mongoosejs.com/) (v9.2.1) |
| **WebSockets** | [Socket.IO](https://socket.io/) (v4.8.3) |
| **Authentication** | [JSON Web Token (jsonwebtoken)](https://github.com/auth0/node-jsonwebtoken), [Passport.js](https://www.passportjs.org/), [bcrypt](https://github.com/kelektiv/node.bcrypt.js) |
| **Payment Gateway** | [Stripe](https://stripe.com/) (v20.4.0) |
| **Push Notifications** | [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) (v13.7.0) |
| **Email Transport** | [Nodemailer](https://nodemailer.com/) (v8.0.1) |
| **Data Validation** | [Zod](https://zod.dev/) (v4.3.6) |
| **File Handling** | [Multer](https://github.com/expressjs/multer) (v2.0.2) |
| **Task Scheduling** | [node-cron](https://github.com/node-cron/node-cron) (v4.2.1) |
| **Security & Utilities** | [Helmet](https://helmetjs.github.io/), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit), [CORS](https://github.com/expressjs/cors), [cookie-parser](https://github.com/expressjs/cookie-parser) |
| **Logging & Monitoring** | [Winston](https://github.com/winstonjs/winston), [winston-daily-rotate-file](https://github.com/winstonjs/winston-daily-rotate-file), [Morgan](https://github.com/expressjs/morgan) |
| **API Documentation** | [Swagger UI Express](https://github.com/scottie1984/swagger-ui-express), [YAML](https://eemeli.org/yaml/) |

---

## 📁 Project Directory Structure

```plaintext
carely-caregiver/
├── openapi.yaml                 # OpenAPI 3.0 specification
├── package.json                 # Dependencies and npm scripts
├── tsconfig.json                # TypeScript compiler configuration
├── uploads/                     # Local storage for uploads (images, documents)
│   ├── images/
│   ├── documents/
│   └── medias/
├── winston/                     # Rotating application log outputs
│   ├── errors/
│   └── successes/
├── src/
│   ├── app.ts                   # Express application setup, middlewares, docs & routes
│   ├── server.ts                # Server bootstrap, MongoDB connection, Socket.IO, Crons
│   ├── DB/                      # Database seeders (Super Admin initialization)
│   ├── config/                  # Configuration loaders (env, passport, stripe, firebase)
│   ├── constants/               # System-wide constants
│   ├── cron/                    # Appointment & scheduled cron definitions
│   ├── enums/                   # TypeScript enums (user, booking, payment, notification, doc)
│   ├── errors/                  # Custom ApiError, Zod error handler, cast/duplicate handlers
│   ├── helpers/                 # JWT helper, email helper (Nodemailer)
│   ├── jobs/                    # Asynchronous task handlers
│   ├── shared/                  # Utilities (catchAsync, sendResponse, logger, emailTemplate)
│   ├── socket/                  # Socket.IO connection manager, handlers, online user cache
│   ├── types/                   # Express request & index type augmentations
│   └── app/
│       ├── buillder/            # QueryBuilder (Search, Filter, Sort, Paginate, Fields)
│       ├── middlewares/         # checkAuth, validateRequest, rateLimiter, uploadHandler
│       ├── routes/              # Central v1 route aggregator
│       └── modules/             # Modular Domain Modules
│           ├── admin/           # Dashboard KPIs, revenue charts, user administration
│           ├── auth/            # Register, login, refresh, OTP, reset, Google OAuth
│           ├── availability/    # Caregiver calendar shifts and time slots
│           ├── booking/         # Booking lifecycle, hold lock, cron auto-release
│           ├── care-recipient/  # Client care recipient management (dependents)
│           ├── caregiver-profile/ # Caregiver onboarding, search, admin verification
│           ├── category/        # Care service categories (Elderly, Childcare, etc.)
│           ├── client-profile/  # Client profiles and administration
│           ├── cms/             # Content Management (Terms, Privacy, FAQs)
│           ├── conversation/    # Chat inbox, conversation threads
│           ├── document/        # Caregiver verification documents upload & approval
│           ├── earning/         # Caregiver revenue ledger, payouts, admin release
│           ├── message/         # Chat messages, read receipts, delivery confirmation
│           ├── notification/    # Notification inbox, unread counts, status updates
│           ├── review/          # Rating & review submissions, average recalculation
│           ├── stripe/          # Stripe checkout sessions, webhooks, refund triggers
│           └── user/            # Base user profile, avatar, FCM token sync
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your host machine:
- **Node.js**: v18.0.0 or higher
- **Yarn** or **npm** (Yarn recommended)
- **MongoDB**: A running local instance (`mongodb://localhost:27017`) or a MongoDB Atlas cluster URI
- **Stripe Account**: For API Keys and Webhook testing via Stripe CLI

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd carely-caregiver
   ```

2. **Install project dependencies:**
   ```bash
   yarn install
   # or: npm install
   ```

### Environment Configuration

Create a `.env` file in the root directory by referencing the sample below:

```ini
# ==============================================================================
# SERVER & GENERAL SETTINGS
# ==============================================================================
NODE_ENV=development
PORT=5050
SERVER_NAME="Carely Caregiver"
IP_ADDRESS=127.0.0.1
CLIENT_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5050
LOGO_URL=https://your-domain.com/logo.png

# ==============================================================================
# DATABASE
# ==============================================================================
DATABASE_URL=mongodb://localhost:27017/carely-caregiver

# ==============================================================================
# SECURITY & AUTHENTICATION (JWT & BCRYPT)
# ==============================================================================
BCRYPT_SALT_ROUNDS=12
JWT_SECRET=super_secret_jwt_access_key_change_me
JWT_EXPIRE_IN=1d
JWT_REFRESH_SECRET=super_secret_jwt_refresh_key_change_me
JWT_REFRESH_EXPIRE_IN=15d

# ==============================================================================
# DEFAULT SUPER ADMIN SEED CREDENTIALS
# ==============================================================================
ADMIN_EMAIL=super.admin@carely.com
ADMIN_PASSWORD=AdminPassword@123

# ==============================================================================
# RATE LIMITING
# ==============================================================================
EXPRESS_RATE_LIMIT=100
EXPRESS_RATE_LIMIT_IN_MINUTES=15

# ==============================================================================
# EMAIL (SMTP / NODEMAILER)
# ==============================================================================
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password
EMAIL_FROM=no-reply@carely.com

# ==============================================================================
# STRIPE PAYMENTS
# ==============================================================================
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:3000/payment/success
STRIPE_CANCEL_URL=http://localhost:3000/payment/cancel
PLATFORM_FEE_PERCENT=15

# ==============================================================================
# GOOGLE OAUTH 2.0
# ==============================================================================
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5050/api/v1/auth/google/callback

# ==============================================================================
# FIREBASE PUSH NOTIFICATIONS (FCM)
# ==============================================================================
FCM_PROJECT_ID=your-firebase-project-id
FCM_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"

# ==============================================================================
# BOOKING SETTINGS
# ==============================================================================
BOOKING_HOLD_MINUTES=30
```

### Running the Application

- **Development Mode** (with hot reload via `ts-node-dev`):
  ```bash
  yarn dev
  ```

- **Compile TypeScript to JavaScript**:
  ```bash
  yarn build
  ```

- **Run Compiled Production Build**:
  ```bash
  yarn start
  ```

- **Format Code with Prettier**:
  ```bash
  yarn format
  ```

---

## 👤 Database Seeding

On initial server startup (`server.ts` ➔ `seedAdmin()`), the application checks for the presence of an administrator account in MongoDB. If none exists, it automatically registers the Super Admin using the credentials specified in your `.env`:

- **Email**: `ADMIN_EMAIL` (default: `super.admin@carely.com`)
- **Password**: `ADMIN_PASSWORD` (default: `AdminPassword@123`)
- **Role**: `ADMIN`
- **Verification**: Automatically marked as `verified` and `active`.

---

## 📖 API Documentation & Swagger

Interactive OpenAPI (Swagger) documentation is pre-configured and loaded from `openapi.yaml`. Once the server is active, navigate to:

```text
http://localhost:5050/api-docs
```

The interactive documentation allows you to inspect endpoint schemas, parameter specifications, request payloads, and test live calls directly.

---

## 🔌 Core API Routes Reference

All business endpoints are mounted under `/api/v1`.

### Authentication & OAuth

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register a new user (`CLIENT` or `CAREGIVER`) |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user, returns Access Token & sets Refresh Cookie |
| `POST` | `/api/v1/auth/refresh-token` | Public | Generate a new access token using the HTTP-only refresh cookie |
| `POST` | `/api/v1/auth/logout` | Authenticated | Invalidate refresh token and clear cookie |
| `POST` | `/api/v1/auth/send-otp` | Public | Send verification OTP to an email address |
| `POST` | `/api/v1/auth/verify-email` | Public | Validate OTP to verify account |
| `POST` | `/api/v1/auth/reset-password` | Authenticated | Reset password using valid OTP verification token |
| `POST` | `/api/v1/auth/change-password` | Authenticated | Change password providing old and new password |
| `GET` | `/api/v1/auth/google` | Public | Initialize Google OAuth 2.0 flow |
| `GET` | `/api/v1/auth/google/callback` | Public | Google OAuth redirect handler (sets token & redirects) |

### User Management

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/user/my-profile` | Authenticated | Get current authenticated user profile |
| `PATCH` | `/api/v1/user/my-profile` | Authenticated | Update user profile and upload new avatar |
| `PATCH` | `/api/v1/user/fcm-token` | Client, Caregiver | Register device FCM token for push notifications |
| `DELETE` | `/api/v1/user/fcm-token` | Client, Caregiver | Unregister device FCM token |
| `GET` | `/api/v1/user/caregivers` | Client, Admin | List caregivers for messaging or browsing |
| `GET` | `/api/v1/user/clients` | Caregiver, Admin | List clients for messaging or browsing |
| `GET` | `/api/v1/user/users` | Admin | Query all users with pagination and search |
| `GET` | `/api/v1/user/users/:id` | Admin | Get detailed user information |
| `PATCH` | `/api/v1/user/users/:id/status`| Admin | Update status (`active` / `inactive`) |
| `PATCH` | `/api/v1/user/users/:id/block` | Admin | Block or unblock a user |
| `DELETE` | `/api/v1/user/users/:id` | Admin | Soft-delete a user account |

### Caregiver Profiles & Directory

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/caregiver-profiles` | Caregiver | Initial profile setup (bio, skills, rates, experience) |
| `GET` | `/api/v1/caregiver-profiles/me` | Caregiver | Retrieve own caregiver profile |
| `PATCH` | `/api/v1/caregiver-profiles/me` | Caregiver | Update profile details and booking availability status |
| `GET` | `/api/v1/caregiver-profiles` | Client | Search and filter verified caregivers |
| `GET` | `/api/v1/caregiver-profiles/:id`| Client | View specific caregiver public profile & ratings |
| `GET` | `/api/v1/caregiver-profiles/admin`| Admin | Admin directory with verification filters |
| `PATCH` | `/api/v1/caregiver-profiles/:id/verify`| Admin | Approve or reject caregiver verification status |
| `PATCH` | `/api/v1/caregiver-profiles/:id/badge` | Admin | Toggle verified badge on caregiver profile |

### Client Profiles & Care Recipients

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/client-profiles` | Client | Create client profile with address and contacts |
| `GET` | `/api/v1/client-profiles/me` | Client | Retrieve own client profile |
| `PATCH` | `/api/v1/client-profiles/me` | Client | Update own client profile |
| `GET` | `/api/v1/client-profiles` | Admin | List all client profiles |
| `POST` | `/api/v1/care-recipient` | Client | Register a care recipient (dependent) with photo |
| `GET` | `/api/v1/care-recipient` | Client | Retrieve all active care recipients for client |
| `GET` | `/api/v1/care-recipient/:id` | Client | Get details of a single care recipient |
| `PATCH` | `/api/v1/care-recipient/:id` | Client | Update care recipient health notes or details |
| `DELETE` | `/api/v1/care-recipient/:id` | Client | Soft-delete care recipient record |

### Availability & Slot Management

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/availability` | Caregiver | Add shift & time slots (`AVAILABLE`) to a date |
| `GET` | `/api/v1/availability/me` | Caregiver | Get own schedule and slots within date range |
| `PATCH` | `/api/v1/availability/:id/shift/:shiftId` | Caregiver | Update specific shift parameters |
| `DELETE` | `/api/v1/availability/:id/shift/:shiftId` | Caregiver | Remove a specific shift from a date |
| `DELETE` | `/api/v1/availability/:id` | Caregiver | Delete entire day's availability |
| `GET` | `/api/v1/availability/:caregiverId` | Public | Query open dates and available slots for booking |

### Bookings & Lifecycle

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/booking` | Client | Create booking, atomically hold slot, create Stripe checkout |
| `GET` | `/api/v1/booking/my` | Client | List all personal bookings (with status filters) |
| `GET` | `/api/v1/booking/caregiver` | Caregiver | List incoming booking requests and assignments |
| `GET` | `/api/v1/booking/:id` | Client, Caregiver | Get detailed booking and payment overview |
| `PATCH` | `/api/v1/booking/:id/accept` | Caregiver | Accept booking (`CONFIRMED`, marks slot `BOOKED`) |
| `PATCH` | `/api/v1/booking/:id/decline` | Caregiver | Decline booking (`DECLINED`, frees slot, refunds payment) |
| `PATCH` | `/api/v1/booking/:id/cancel` | Client | Cancel booking (applies 90% refund policy, frees slot) |
| `PATCH` | `/api/v1/booking/:id/complete` | Caregiver | Mark session completed (creates earning record) |
| `GET` | `/api/v1/booking` | Admin | View all bookings across the platform |
| `PATCH` | `/api/v1/booking/:id/admin-cancel` | Admin | Administrative booking cancellation |

### Payments & Stripe Webhook

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/webhook/stripe` | Stripe Service | Ingest raw Stripe webhook events (`checkout.session.completed`) |
| `POST` | `/api/v1/stripe/create-checkout-session`| Client | Manually initiate checkout session for pending booking |
| `GET` | `/api/v1/stripe/payment-status/:bookingId`| Client, Caregiver | Check Stripe payment processing status |

### Earnings & Payouts

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/earnings/me` | Caregiver | View historical earnings ledger |
| `GET` | `/api/v1/earnings/me/summary` | Caregiver | Summary metrics (Total Earned, Pending, Paid Out) |
| `PATCH` | `/api/v1/earnings/payout-method` | Caregiver | Set preferred payout details (Bank, Stripe, etc.) |
| `GET` | `/api/v1/earnings` | Admin | Administrative overview of all platform earnings |
| `PATCH` | `/api/v1/earnings/:id/release` | Admin | Release caregiver earning payout (`HELD` ➔ `PAID`) |

### Real-time Conversations & Messaging

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/conversation/search-users`| Client, Caregiver | Search users eligible for direct messaging |
| `POST` | `/api/v1/conversation` | Client, Caregiver | Start or get existing conversation between two users |
| `GET` | `/api/v1/conversation` | Client, Caregiver | Get user's inbox list with unread counts and last message |
| `GET` | `/api/v1/conversation/:id` | Client, Caregiver | Get single conversation details |
| `POST` | `/api/v1/message` | Client, Caregiver | Send message (supports optional file attachment) |
| `GET` | `/api/v1/message/:conversationId` | Client, Caregiver | Fetch paginated chat history |
| `PATCH` | `/api/v1/message/:conversationId/seen` | Client, Caregiver | Mark all unread messages in conversation as read |
| `DELETE` | `/api/v1/message/:messageId` | Client, Caregiver | Soft-delete a sent message |

### Reviews & Ratings

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/review` | Client | Submit a rating (1-5) and feedback for a completed booking |
| `GET` | `/api/v1/review/:caregiverId` | Public | Get all reviews and aggregate rating for a caregiver |
| `DELETE` | `/api/v1/review/:id` | Admin | Delete inappropriate or fraudulent review |

### Verification Documents

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/document/upload` | Caregiver | Upload verification document (ID, CPR, Criminal Record) |
| `GET` | `/api/v1/document/me` | Caregiver | View uploaded documents and their verification status |
| `DELETE` | `/api/v1/document/:id` | Caregiver | Remove an unverified or rejected document |
| `GET` | `/api/v1/document` | Admin | List all submitted documents across caregivers |
| `PATCH` | `/api/v1/document/:id/approve` | Admin | Approve submitted document |
| `PATCH` | `/api/v1/document/:id/reject` | Admin | Reject submitted document with specific reason |

### Admin Platform Operations

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/stats` | Admin | Platform overview KPIs (Users, Revenue, Active Bookings) |
| `GET` | `/api/v1/admin/revenue-chart` | Admin | Revenue trend breakdown by `week` or `month` |
| `POST` | `/api/v1/admin/invite-caregiver` | Admin | Dispatch email invitation to join as a caregiver |

### CMS Pages

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cms` | Admin | List all dynamic CMS pages |
| `PUT` | `/api/v1/cms/:slug` | Admin | Create or update content for a slug (e.g. `privacy-policy`) |
| `GET` | `/api/v1/cms/:slug` | Public | Retrieve public content for a given slug |

---

## ⚡ Real-Time Socket.IO Engine

The Socket.IO server runs on the same HTTP port as Express. All incoming connections are authenticated before the connection handshake via a JWT token.

### Connecting to Socket.IO

Clients must pass their JWT access token via one of the following methods:
1. `auth: { token: "<ACCESS_TOKEN>" }` (Recommended)
2. `headers: { authorization: "Bearer <ACCESS_TOKEN>" }`
3. `query: { token: "<ACCESS_TOKEN>" }`

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:5050", {
  auth: {
    token: "YOUR_JWT_ACCESS_TOKEN",
  },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("Connected with socket ID:", socket.id);
});
```

### Socket Rooms
Upon successful handshake, the server automatically joins the socket into a private room named with their `userId`:
```text
socket.join(userId)
```
Any event emitted to `userId` reaches that specific user across all their active devices.

### Supported Socket Events

#### Client ➔ Server

| Event | Payload | Description |
| :--- | :--- | :--- |
| `conversation:join` | `conversationId: string` | Join real-time room for a chat thread |
| `conversation:leave`| `conversationId: string` | Leave the conversation room |
| `typing:start` | `{ conversationId: string }` | Broadcast typing indicator to conversation participants |
| `typing:stop` | `{ conversationId: string }` | Stop typing indicator |
| `message:delivered` | `{ messageId, senderId, conversationId }` | Acknowledge delivery of message to device |
| `message:seen` | `{ conversationId, senderId }` | Broadcast read receipt to message sender |
| `notification:ack` | `{ notificationId: string }` | Acknowledge delivery of notification |

#### Server ➔ Client

| Event | Payload | Description |
| :--- | :--- | :--- |
| `user:online` | `{ userId, userName, userRole }` | Broadcasted when a user connects |
| `user:offline` | `{ userId, userName }` | Broadcasted when a user disconnects |
| `message:new` | `IMessageSocketPayload` | Emitted to conversation room when a new message is posted |
| `message:delivered`| `{ messageId, conversationId, deliveredAt }` | Notifies original sender that message reached recipient |
| `message:seen` | `{ conversationId, seenBy, seenAt }` | Notifies sender that recipient opened conversation |
| `notification:new` | `NotificationDocument` | Real-time push for new in-app alerts |
| `booking:update` | `{ bookingId, status, message, updatedAt }`| Dispatched on any booking status transition |

---

## ⏱ Scheduled Cron Jobs

The application runs background automated jobs using `node-cron`:

### 1. Booking Auto-Release Cron (`src/app/modules/booking/booking.cron.ts`)
- **Schedule**: `* * * * *` (Runs every minute)
- **Target**: Finds bookings with status `PENDING` where `heldUntil <= new Date()`.
- **Action**:
  1. Marks booking status as `AUTO_RELEASED`.
  2. Atomically restores the caregiver's calendar slot in `Availability` from `HELD` to `AVAILABLE`.
  3. Dispatches multi-channel notification and email alert to the client informing them of hold expiration.

---

## 📐 Standardized API Response & Error Handling

### Standard Success Response

All controller actions utilize the `sendResponse` utility for predictable client consumption:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Operation completed successfully",
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPage": 5
  },
  "data": { ... }
}
```

### Standard Error Response

Uncaught exceptions, validation errors (Zod), and business exceptions (`ApiError`) are normalized by `globalErrorHandler`:

```json
{
  "success": false,
  "message": "Validation Error",
  "errorMessages": [
    {
      "path": "email",
      "message": "Invalid email address format"
    }
  ],
  "stack": "Error stack trace (only visible when NODE_ENV=development)"
}
```

---

## 🛡 Security & Performance

- **Helmet**: Secures HTTP response headers against common vulnerabilities.
- **Trust Proxy**: Enabled (`app.set('trust proxy', true)`) to support reverse proxies (Nginx / Cloudflare).
- **CORS Whitelist**: Whitelists configured frontend and mobile development endpoints with credential support.
- **Express Rate Limiting**: Global DDoS protection limiting rapid-fire requests.
- **Stripe Raw Body Isolation**: Special raw body parsing rule strictly for `/webhook/stripe` while maintaining JSON body parsing across all application routes.
- **Safe Database Indexing**: Multi-field indexes across high-traffic query patterns (Caregiver search, Availability dates, Bookings, Conversations).
- **Process Crash Handlers**: Intercepts `uncaughtException` and `unhandledRejection` with structured logging and graceful connection terminations.

---

## 🚢 Deployment & Production Recommendations

### Process Management with PM2

To ensure maximum availability, process restarts, and cluster scaling:

1. Install PM2 globally:
   ```bash
   npm install -g pm2
   ```

2. Compile TypeScript and launch with PM2:
   ```bash
   yarn build
   pm2 start dist/server.js --name "carely-api" -i max
   ```

3. Save process state:
   ```bash
   pm2 save
   pm2 startup
   ```

### Nginx Reverse Proxy Configuration

When hosting behind an Nginx reverse proxy, ensure WebSocket upgrade headers and raw webhook proxying are configured:

```nginx
server {
    listen 80;
    server_name api.carely.com;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forwarded client headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for Socket.IO
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

---

## 👨‍💻 Author & License

- **Author**: Lokman Sarkar & Rahad Ullah
- **License**: [ISC License](https://opensource.org/licenses/ISC)
- **Version**: `1.0.0`
