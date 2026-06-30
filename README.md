<div dir="ltr" align="center">

# 🌐 Ryxo Panel

[![English](https://img.shields.io/badge/English-0077B5?style=for-the-badge&logo=googletranslate&logoColor=white)](README.md)
[![Persian](https://img.shields.io/badge/فارسی-0077B5?style=for-the-badge&logo=googletranslate&logoColor=white)](README.fa.md)

</div>

---

# 🇬🇧 English

## 📌 Overview
**Ryxo Panel** is a complete, serverless VPN management platform that runs entirely on Cloudflare's free infrastructure. It provides a professional interface for creating, managing, and distributing VLESS subscriptions with advanced configuration options.

### 🎯 Why Ryxo Panel?
- ✅ **Zero Server Cost** - Runs 100% on Cloudflare Workers (Free Tier)
- ✅ **No Maintenance** - Automatic updates and zero downtime
- ✅ **User-Friendly** - Beautiful interface with dark/light themes
- ✅ **Feature-Rich** - Advanced user management with granular controls
- ✅ **Secure** - Latest encryption and fingerprint obfuscation

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

## 🚀 Quick Start Guide

### Prerequisites
- A [Cloudflare](https://dash.cloudflare.com) account
- No coding knowledge required!

### Deploy in 4 Easy Steps

#### Step 1: Get Your Token
1. Visit the **[Ryxo Deployer](https://itzsepanta.ir/)**
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
> **Never share your admin password!** Store it in a password manager.

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

## 📱 Status Page Features
Your users can view their subscription status via a dedicated link:
- ✅ **Connection Status** - Active/Expired/Blocked
- 📊 **Usage Progress** - Visual data consumption graph
- ⏱️ **Time Remaining** - Days left tracker
- 🔗 **Quick Actions** - One-click config copying
- 📱 **QR Code** - Scan to connect instantly

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

## 🔧 Environment Variables
The following variables are automatically configured during deployment:
| Variable        | Description           | Type        |
| --------------- | --------------------- | ----------- |
| `DB`            | D1 Database binding   | D1 Database |
| `CF_API_TOKEN`  | Cloudflare API Token  | Secret Text |
| `CF_ACCOUNT_ID` | Cloudflare Account ID | Secret Text |

## 📈 Performance
- **Response Time:** < 100ms average
- **Concurrent Users:** 100+ (Worker limits apply)
- **Database Queries:** Optimized with caching
- **Traffic Handling:** 10MB/s+ throughput
- **Uptime:** 99.99% (Cloudflare SLA)

## 📊 Project Status
- ✅ **Active Development:** Yes
- ✅ **Stable Release:** Yes
- ✅ **Security Updates:** Regular
- ✅ **Community Support:** Active
- ✅ **Documentation:** Complete

---

# 🇮🇷 فارسی

<div align="center">
  
  <img src="https://img.shields.io/badge/نسخه-26.2.1-blue?style=for-the-badge">
  <img src="https://img.shields.io/badge/وضعیت-فعال-success?style=for-the-badge">
  <img src="https://img.shields.io/badge/مجوز-MIT-green?style=for-the-badge">

</div>

## 📌 معرفی
**پنل رایکسو** یک پلتفرم کامل و بدون سرور برای مدیریت VPN است که کاملاً روی زیرساخت رایگان Cloudflare اجرا می‌شود. این پنل یک رابط حرفه‌ای برای ایجاد، مدیریت و توزیع اشتراک‌های VLESS با تنظیمات پیشرفته ارائه می‌دهد.

### 🎯 چرا پنل رایکسو؟
- ✅ **هزینه سرور صفر** - ۱۰۰٪ روی Cloudflare Workers (سطح رایگان) اجرا می‌شود
- ✅ **بدون نیاز به نگهداری** - بروزرسانی خودکار و بدون وقفه
- ✅ **کاربرپسند** - رابط زیبا با تم‌های تاریک/روشن
- ✅ **پر امکانات** - مدیریت پیشرفته کاربران با کنترل‌های دقیق
- ✅ **امن** - آخرین روش‌های رمزنگاری و اختفای اثر انگشت

## ✨ امکانات کلیدی

### 👥 **مدیریت کاربران**
- ایجاد و مدیریت کاربران نامحدود
- تنظیم سقف حجم مصرفی (گیگابایت)
- تعیین دوره اعتبار (روز)
- قطع خودکار پس از انقضا
- مانیتورینگ لحظه‌ای وضعیت کاربران

### 🔌 **اتصالات همزمان**
- تعیین حداکثر دستگاه‌های همزمان برای هر کاربر
- قطع خودکار اتصالات اضافی
- جلوگیری از اشتراک‌گذاری حساب

### 🛡 **امکانات پیشرفته**
- تنظیمات Fragment (طول و فاصله)
- شبیه‌سازی اثر انگشت مرورگر (iOS، Chrome، Firefox، Safari، Android، Edge، تصادفی)
- پشتیبانی از پورت‌های TLS و غیر TLS
- انتخاب هوشمند IP

### 📡 **انتخابگر IP تمیز**
- دریافت IP‌های تمیز کلودفلر از گیت‌هاب
- پشتیبانی از همه اپراتورهای اصلی (همراه اول، ایرانسل، شاتل و...)
- اعمال یک‌کلیک IP به کاربران

### 📊 **مانیتورینگ لحظه‌ای**
- اتصال به GraphQL API کلودفلر
- نمایش مصرف درخواست‌های روزانه و ۳۰ روزه
- هشدار خودکار در ۹۰٪ ظرفیت
- جلوگیری از مسدود شدن حساب

### 🔄 **بروزرسانی OTA**
- بررسی بروزرسانی با یک کلیک
- بدون اختلال در دیتابیس
- استقرار خودکار نسخه‌های جدید

### 🔗 **فرمت‌های اشتراک**
- لینک‌های اشتراک متنی ساده
- فرمت مدرن JSON
- تولید کد QR
- پشتیبانی از پورت‌های TLS و غیر TLS

### 🌓 **رابط کاربری**
- تغییر تم تاریک/روشن
- طراحی کاملاً واکنش‌گرا
- رابط مدرن و تمیز
- پشتیبانی از زبان فارسی و انگلیسی

## 🚀 راهنمای شروع سریع

### پیش‌نیازها
- یک حساب [Cloudflare](https://dash.cloudflare.com)
- بدون نیاز به دانش کدنویسی!

### استقرار در ۴ مرحله ساده

#### مرحله ۱: دریافت توکن
۱. به **[Ryxo Deployer](https://itzsepanta.ir/)** بروید
۲. روی **"دریافت توکن کلودفلر"** کلیک کنید
۳. در صورت نیاز وارد کلودفلر شوید
۴. به انتهای صفحه بروید و روی **"Continue to summary"** کلیک کنید
۵. توکن خود را ساخته و کپی کنید

#### مرحله ۲: استقرار پنل
۱. توکن را در دیپلویر جایگذاری کنید
۲. روی **"استقرار پنل"** کلیک کنید
۳. منتظر بمانید تا راه‌اندازی خودکار انجام شود (۱۵-۲۰ ثانیه)

#### مرحله ۳: ورود به پنل
۱. پس از اتمام استقرار، روی **"ورود به پنل"** کلیک کنید
۲. در اولین ورود، رمز عبور مدیریت را تنظیم کنید
۳. رمز عبور خود را در جای امن ذخیره کنید

#### مرحله ۴: مدیریت کاربران
۱. کاربران را با محدودیت‌ها و تاریخ انقضای دلخواه اضافه کنید
۲. لینک‌های اشتراک را با کاربران خود به اشتراک بگذارید
۳. مصرف را به صورت لحظه‌ای مانیتور کنید

> [!WARNING]
> **هرگز رمز عبور مدیریت خود را با کسی به اشتراک نگذارید!** آن را در یک مدیریت رمز عبور ذخیره کنید.

## 🎮 استفاده از پنل

### نمای کلی داشبورد
| کارت                     | توضیحات                          |
| ------------------------ | -------------------------------- |
| 👥 **کل کاربران**        | تعداد کاربران ثبت‌نام شده        |
| 🟢 **کاربران آنلاین**    | کاربران متصل در حال حاضر         |
| 📊 **درخواست‌های روزانه** | مصرف درخواست کلودفلر (امروز)    |
| 💾 **مصرف کل**           | مجموع مصرف داده (۳۰ روز)         |
| 🏆 **پر مصرف‌ترین کاربر** | کاربر با بیشترین مصرف            |

### مدیریت کاربران
**ایجاد کاربر:**
- تنظیم نام کاربری، سقف حجم، روزهای اعتبار
- پیکربندی حداکثر اتصالات همزمان
- انتخاب پورت‌ها (TLS/غیر TLS)
- افزودن IP تمیز (اختیاری)
- انتخاب اثر انگشت مرورگر

**عملیات روی کاربر:**
- 📋 کپی کانفیگ VLESS
- 📄 کپی کانفیگ JSON
- 📱 تولید کد QR
- 🔄 تغییر وضعیت کاربر
- ✏️ ویرایش تنظیمات کاربر
- 🗑️ حذف کاربر

### لینک‌های اشتراک
هر کاربر دریافت می‌کند:
- 📝 **اشتراک متنی:** فرمت ساده برای همه کلاینت‌ها
- 📊 **اشتراک JSON:** فرمت مدرن با کانفیگ کامل
- 📱 **صفحه وضعیت:** مشاهده لحظه‌ای وضعیت کاربر
- 🔗 **کدهای QR:** راه‌اندازی آسان روی موبایل

## 📱 امکانات صفحه وضعیت
کاربران شما می‌توانند وضعیت اشتراک خود را از طریق یک لینک اختصاصی مشاهده کنند:
- ✅ **وضعیت اتصال** - فعال/منقضی/مسدود
- 📊 **پیشرفت مصرف** - نمودار بصری مصرف داده
- ⏱️ **زمان باقیمانده** - نشان‌دهنده روزهای باقیمانده
- 🔗 **عملیات سریع** - کپی کانفیگ با یک کلیک
- 📱 **کد QR** - اسکن برای اتصال فوری

### تکنولوژی‌های استفاده شده
| جزء              | تکنولوژی                          |
| ---------------- | --------------------------------- |
| **اجرا**         | Cloudflare Workers (موتور V8)     |
| **دیتابیس**     | Cloudflare D1 (SQLite)            |
| **فرانت‌اند**   | TailwindCSS، Vanilla JS، QRCode.js |
| **پروتکل**      | VLESS روی WebSocket                |
| **DNS**          | Cloudflare DNS-over-HTTPS         |
| **API**          | نقاط پایانی RESTful               |
| **استقرار**      | استقرار خودکار بدون دخالت         |

### ویژگی‌های پشتیبانی شده
| ویژگی                   | وضعیت           |
| ----------------------- | --------------- |
| پروتکل VLESS            | ✅ پشتیبانی کامل |
| حمل‌ونقل WebSocket      | ✅ پشتیبانی کامل |
| پورت‌های TLS/غیر TLS    | ✅ پشتیبانی کامل |
| مبهم‌سازی Fragment      | ✅ قابل تنظیم   |
| اثر انگشت مرورگر        | ✅ ۱۰+ گزینه    |
| انتخاب IP تمیز          | ✅ دریافت خودکار |
| اتصالات همزمان          | ✅ قابل تنظیم   |
| انقضای خودکار           | ✅ حجم و زمان   |
| تحلیل کلودفلر           | ✅ GraphQL API  |
| بروزرسانی OTA           | ✅ یک کلیک      |
| فرمت‌های اشتراک         | ✅ متن + JSON   |
| کدهای QR                | ✅ تولید خودکار |
| تم تاریک/روشن           | ✅ تغییر        |
| طراحی واکنش‌گرا         | ✅ همه دستگاه‌ها |

## 🔧 متغیرهای محیطی
متغیرهای زیر به طور خودکار در زمان استقرار پیکربندی می‌شوند:
| متغیر            | توضیحات                | نوع          |
| ---------------- | ----------------------- | ------------ |
| `DB`             | اتصال دیتابیس D1        | D1 Database  |
| `CF_API_TOKEN`   | توکن API کلودفلر        | Secret Text  |
| `CF_ACCOUNT_ID`  | شناسه حساب کلودفلر      | Secret Text  |

## 📈 عملکرد
- **زمان پاسخگویی:** میانگین کمتر از ۱۰۰ میلی‌ثانیه
- **کاربران همزمان:** بیش از ۱۰۰ (با محدودیت Worker)
- **پرس‌وجوهای دیتابیس:** بهینه‌سازی شده با کش
- **پردازش ترافیک:** پهنای باند بیش از ۱۰ مگابایت بر ثانیه
- **در دسترس بودن:** ۹۹.۹۹٪ (طبق SLA کلودفلر)

## 📊 وضعیت پروژه
- ✅ **توسعه فعال:** بله
- ✅ **نسخه پایدار:** بله
- ✅ **بروزرسانی امنیتی:** منظم
- ✅ **پشتیبانی جامعه:** فعال
- ✅ **مستندات:** کامل
