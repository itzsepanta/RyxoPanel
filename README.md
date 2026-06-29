## 📌 Overview

**Ryxo Panel** is a complete, serverless VPN management platform that runs entirely on Cloudflare's free infrastructure. It provides a professional interface for creating, managing, and distributing VLESS subscriptions with advanced configuration options.

### 🎯 Why Ryxo Panel?

- ✅ **Zero Server Cost** - Runs 100% on Cloudflare Workers (Free Tier)
- ✅ **No Maintenance** - Automatic updates and zero downtime
- ✅ **User-Friendly** - Beautiful interface with dark/light themes
- ✅ **Feature-Rich** - Advanced user management with granular controls
- ✅ **Secure** - Latest encryption and fingerprint obfuscation

---

## ✨ Key Features

### 👥 **User Management**

- Create and manage unlimited users
- Set individual volume limits (GB)
- Configure validity periods (days)
- Automatic disconnection upon expiry
- Real-time user status monitoring

### 🔌 **Concurrent Connections**

- Define maximum simultaneous devices per user
- Auto-disconnect excess connections instantly
- Prevent account sharing abuse

### 🛡 **Advanced Bypass**

- Fragment configuration (Length & Interval)
- Browser fingerprint emulation (iOS, Chrome, Firefox, Safari, Android, Edge, Randomized)
- TLS/Non-TLS port support
- Smart IP selection

### 📡 **Clean IP Selector**

- Fetch updated clean Cloudflare IPs from GitHub
- Support for all major operators (MCI, Irancell, Shatel, etc.)
- One-click IP application to users

### 📊 **Real-Time Monitoring**

- Cloudflare GraphQL API integration
- Display daily and 30-day request usage
- Automatic warning at 90% usage threshold
- Prevent account blocking

### 🔄 **OTA Updates**

- Check for updates with one click
- No database disruption
- Automatic deployment of new versions

### 🔗 **Subscription Formats**

- Simple text subscription links
- Modern JSON format
- QR code generation
- TLS and Non-TLS port support

### 🌓 **UI/UX**

- Dark/Light theme toggle
- Fully responsive design
- Modern, clean interface
- Persian and English language support

---

## 🚀 Quick Start Guide

### Prerequisites

- A [Cloudflare](https://dash.cloudflare.com) account
- No coding knowledge required!

### Deploy in 4 Easy Steps

#### Step 1: Get Your Token

1. Visit the **[Ryxo Deployer](soon)**
2. Click **"Get Cloudflare Token"**
3. Log in to Cloudflare if needed
4. Scroll to the bottom and click **"Continue to summary"**
5. Create and copy your token

#### Step 2: Deploy Panel

1. Paste your token in the deployer
2. Click **"Deploy Panel"**
3. Wait for the automatic setup (15-20 seconds)

#### Step 3: Access Panel

1. Click **"Enter Panel"** when deployment completes
2. Set your admin password on first login
3. Store your password securely

#### Step 4: Manage Users

1. Add users with custom limits and expiry dates
2. Share subscription links with your users
3. Monitor usage in real-time

> [!WARNING]
> ⚠️ **Never share your admin password!** Store it in a password manager.

---

## 🎮 Using the Panel

### Dashboard Overview

| Card                  | Description                      |
| --------------------- | -------------------------------- |
| 👥 **Total Users**    | Number of registered users       |
| 🟢 **Online Users**   | Currently connected users        |
| 📊 **Daily Requests** | Cloudflare request usage (today) |
| 💾 **Total Usage**    | Combined data usage (30 days)    |
| 🏆 **Top User**       | User with highest consumption    |

### User Management

**Create User:**

- Set username, volume limit, expiry days
- Configure max concurrent connections
- Select ports (TLS/Non-TLS)
- Add clean IPs (optional)
- Choose browser fingerprint

**User Actions:**

- 📋 Copy VLESS config
- 📄 Copy JSON config
- 📱 Generate QR code
- 🔄 Toggle user status
- ✏️ Edit user settings
- 🗑️ Delete user

### Subscription Links

Each user gets:

- 📝 **Text Subscription:** Simple format for all clients
- 📊 **JSON Subscription:** Modern format with full config
- 📱 **Status Page:** Real-time user status view
- 🔗 **QR Codes:** Easy mobile setup

---

## 📱 Status Page Features

Your users can view their subscription status via a dedicated link:

- ✅ **Connection Status** - Active/Expired/Blocked
- 📊 **Usage Progress** - Visual data consumption graph
- ⏱️ **Time Remaining** - Days left tracker
- 🔗 **Quick Actions** - One-click config copying
- 📱 **QR Code** - Scan to connect instantly

---

### Technology Stack

| Component      | Technology                         |
| -------------- | ---------------------------------- |
| **Runtime**    | Cloudflare Workers (V8 Engine)     |
| **Database**   | Cloudflare D1 (SQLite)             |
| **Frontend**   | TailwindCSS, Vanilla JS, QRCode.js |
| **Protocol**   | VLESS over WebSocket               |
| **DNS**        | Cloudflare DNS-over-HTTPS          |
| **API**        | RESTful endpoints                  |
| **Deployment** | Zero-touch auto-deployer           |

### Supported Features

| Feature                | Status           |
| ---------------------- | ---------------- |
| VLESS Protocol         | ✅ Full Support  |
| WebSocket Transport    | ✅ Full Support  |
| TLS/Non-TLS Ports      | ✅ Full Support  |
| Fragment Obfuscation   | ✅ Configurable  |
| Browser Fingerprint    | ✅ 10+ Options   |
| Clean IP Selection     | ✅ Auto-Fetch    |
| Concurrent Connections | ✅ Configurable  |
| Auto-Expiry            | ✅ Volume & Time |
| Cloudflare Analytics   | ✅ GraphQL API   |
| OTA Updates            | ✅ One-Click     |
| Subscription Formats   | ✅ Text + JSON   |
| QR Codes               | ✅ Auto-Generate |
| Dark/Light Theme       | ✅ Toggle        |
| Responsive Design      | ✅ All Devices   |

---

## 🔧 Environment Variables

The following variables are automatically configured during deployment:

| Variable        | Description           | Type        |
| --------------- | --------------------- | ----------- |
| `DB`            | D1 Database binding   | D1 Database |
| `CF_API_TOKEN`  | Cloudflare API Token  | Secret Text |
| `CF_ACCOUNT_ID` | Cloudflare Account ID | Secret Text |

---

## 📈 Performance

- **Response Time:** < 100ms average
- **Concurrent Users:** 100+ (Worker limits apply)
- **Database Queries:** Optimized with caching
- **Traffic Handling:** 10MB/s+ throughput
- **Uptime:** 99.99% (Cloudflare SLA)

---

## 📊 Project Status

- ✅ **Active Development:** Yes
- ✅ **Stable Release:** Yes
- ✅ **Security Updates:** Regular
- ✅ **Community Support:** Active
- ✅ **Documentation:** Complete
