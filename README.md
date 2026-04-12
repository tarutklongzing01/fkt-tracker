# Rider Track บน Vercel

เว็บติดตามไรเดอร์แบบเรียลไทม์ด้วย `HTML`, `CSS`, `JavaScript`, `Firebase Auth`, `Firebase Realtime Database`, `Leaflet` และ `OpenStreetMap`

## ฟีเจอร์

- หน้า `login` สำหรับเข้าสู่ระบบด้วย Firebase Auth
- หน้า `admin` สำหรับดูตำแหน่งไรเดอร์สดบนแผนที่ พร้อม sidebar รายชื่อไรเดอร์
- หน้า `rider` สำหรับส่งพิกัด GPS ไปยัง Firebase ตามค่า `firebaseRuntime.riderPingIntervalMs` (ค่าเริ่มต้น 5 วินาที)
- แสดงสถานะ `ออนไลน์/ออฟไลน์` โดยถือว่าออฟไลน์เมื่อไม่อัปเดตเกินค่า `firebaseRuntime.offlineThresholdMs` (ค่าเริ่มต้น 30 วินาที)
- ใช้งานแบบ static site ได้ทันทีบน Vercel โดยไม่ต้องใช้ Express, Socket.IO, React หรือ TypeScript

## โครงสร้างไฟล์

```text
.
|-- admin.html
|-- index.html
|-- login.html
|-- rider.html
|-- css/
|   `-- styles.css
|-- js/
|   |-- admin.js
|   |-- app.js
|   |-- firebase-service.js
|   |-- login.js
|   `-- rider.js
|-- firebase-config.js
|-- firebase.rules.json
|-- README.md
`-- vercel.json
```

## 1. สร้าง Firebase Project

1. ไปที่ Firebase Console แล้วสร้างโปรเจกต์ใหม่
2. เปิดใช้งาน `Authentication > Sign-in method > Email/Password`
3. เปิดใช้งาน `Realtime Database`
4. สร้าง Web App และคัดลอกค่า config มาใส่ในไฟล์ `firebase-config.js`

ตัวอย่างไฟล์ `firebase-config.js`

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const firebaseRuntime = {
  riderPingIntervalMs: 5000,
  offlineThresholdMs: 30000
};
```

## 2. ตั้งค่า Realtime Database Rules

นำไฟล์ `firebase.rules.json` ไปใส่ในหน้า Rules ของ Realtime Database หรือคัดลอกเนื้อหาดังนี้

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && ((auth.uid === $uid && !data.exists() && newData.child('name').isString() && newData.child('name').val().matches(/^.{1,80}$/) && ((newData.child('role').val() === 'admin' && auth.token.email != null && auth.token.email === root.child('settings').child('adminEmail').val()) || (newData.child('role').val() === 'rider' && newData.child('riderCode').isString() && newData.child('riderCode').val().matches(/^RD[A-Z0-9]{1,12}$/)))) || (root.child('users').child(auth.uid).child('role').val() === 'admin' && data.exists() && newData.child('role').val() === data.child('role').val() && newData.child('name').isString() && newData.child('name').val().matches(/^.{1,80}$/) && ((data.child('role').val() === 'rider' && newData.child('riderCode').isString() && newData.child('riderCode').val().matches(/^RD[A-Z0-9]{1,12}$/)) || data.child('role').val() === 'admin')))"
      }
    },
    "settings": {
      ".read": "auth != null",
      ".write": false
    },
    "riders": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid && root.child('users').child(auth.uid).child('role').val() === 'rider'"
      }
    }
  }
}
```

## 3. สร้างผู้ใช้และ role

สร้างผู้ใช้ใน `Authentication` ก่อน แล้วนำ `uid` ของแต่ละคนไปผูกกับ node `users`

หมายเหตุ:
ผู้ใช้ที่ล็อกอินครั้งแรกจากหน้าเว็บและยังไม่มีโปรไฟล์ใน `users/{uid}` ระบบจะตรวจ `settings/adminEmail` ก่อน ถ้าอีเมลตรงกันจะสร้างเป็น `admin` ให้ทันที ถ้าไม่ตรงจะสร้างเป็น `rider` อัตโนมัติพร้อม `riderCode`

แอดมินสามารถแก้ `name` และ `riderCode` ของไรเดอร์จากหน้า `admin` ได้ โดยระบบจะเขียนกลับไปที่ `users/{uid}` และใช้ข้อมูลนั้นแสดงในแผงควบคุมทันที

ตัวอย่างข้อมูลตั้งค่า:

```json
{
  "settings": {
    "adminEmail": "admin@example.com"
  },
  "users": {
    "ADMIN_UID": {
      "name": "ผู้ดูแลระบบ",
      "role": "admin"
    }
  }
}
```

ตัวอย่างข้อมูลใน Realtime Database:

```json
{
  "users": {
    "ADMIN_UID": {
      "name": "ผู้ดูแลระบบ",
      "role": "admin"
    },
    "RIDER_UID_01": {
      "name": "สมชาย ใจดี",
      "role": "rider",
      "riderCode": "RD001"
    },
    "RIDER_UID_02": {
      "name": "สุดา ส่งไว",
      "role": "rider",
      "riderCode": "RD002"
    }
  }
}
```

## 4. รันบนเครื่อง

โปรเจกต์นี้เป็น static site จึงเปิดได้หลายวิธี เช่น

```bash
npx serve .
```

หรือใช้ extension / local server อื่นก็ได้ แต่ต้องเปิดผ่าน `http://localhost` หรือ `https://` เพื่อให้ geolocation ทำงาน

## 5. Deploy บน Vercel

1. Push โปรเจกต์ขึ้น GitHub/GitLab/Bitbucket
2. Import โปรเจกต์เข้า Vercel
3. ไม่ต้องตั้ง Build Command
4. Output Directory ไม่ต้องกำหนดเพิ่ม
5. Deploy ได้ทันที เพราะ `vercel.json` จัด route ไว้แล้ว

หลัง deploy:

- หน้า login อยู่ที่ `/`, `/login` หรือ `login.html`
- หน้าแอดมินอยู่ที่ `/admin`
- หน้าไรเดอร์อยู่ที่ `/rider`

## การทำงานของระบบ

- ไรเดอร์ล็อกอินแล้วหน้า `rider` จะขอสิทธิ์ GPS
- เมื่ออนุญาตแล้ว ระบบจะอ่านพิกัดและบันทึกไปที่ `riders/{uid}` ตามค่า `firebaseRuntime.riderPingIntervalMs`
- หน้า `admin` ใช้ `onValue()` ฟังการเปลี่ยนแปลงจาก `riders`
- เมื่อไรเดอร์ login สำเร็จ ระบบจะเขียนสถานะ `online: true` ไปที่ `riders/{uid}`
- เมื่อกด logout ระบบจะเขียนสถานะ `online: false`
- ถ้ายังไม่ได้กด logout หน้าแอดมินจะยังมองว่าไรเดอร์ `ออนไลน์` แม้จะปิดหน้าเว็บไปแล้ว

## หมายเหตุสำคัญ

- ค่า Firebase config ฝั่ง frontend ไม่ใช่ secret แต่ต้องใช้คู่กับ Rules ที่รัดกุม
- การระบุตำแหน่งด้วย GPS ทำงานบน `https://` หรือ `localhost` เท่านั้น
- ถ้าต้องการให้ไรเดอร์ปิดหน้าแล้วกลายเป็นออฟไลน์ทันที จำเป็นต้องเพิ่ม logic แบบ presence ต่อภายหลัง แต่ในเวอร์ชันนี้ระบบจะตัดเป็นออฟไลน์เมื่อไม่อัปเดตเกินค่า `firebaseRuntime.offlineThresholdMs`
