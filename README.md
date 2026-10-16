# HIDE & TROLL — ซ่อนหาแปลงร่าง 3D ออนไลน์

เกมซ่อนหาแบบแปลงร่าง เล่นกับเพื่อน 3–10 คน บนเว็บ (คอมพิวเตอร์ + มือถือ)
ฝ่ายซ่อนแปลงเป็นเก้าอี้ ตู้ กล่อง ฯลฯ ส่วนฝ่ายล่าต้องตามหาให้ครบภายใน 5 นาที

แผนที่ 6 แบบ (จัดของสุ่มใหม่ทุกรอบ): 👻 บ้านผีสิง • 🛒 ซูเปอร์มาร์เก็ต • 🏫 โรงเรียน • 🏥 โรงพยาบาล • 📦 โกดังสินค้า • 🎡 สวนสนุก

## รันในเครื่อง

```bash
npm install
npm start
```

เปิด http://localhost:3000 แล้วกด **สร้างห้อง** → ส่งรหัส 4 ตัว (หรือลิงก์) ให้เพื่อน

> ทดสอบหลายคนในเครื่องเดียว: เปิดหลายแท็บ/หลายเบราว์เซอร์แล้วเข้าห้องเดียวกัน
> เล่นกับมือถือในวง Wi-Fi เดียวกัน: เปิด `http://<IP เครื่องคอม>:3000`

ปรับเวลาเพื่อทดสอบได้ด้วยตัวแปร `HIDE_TIME`, `HUNT_TIME`, `END_TIME` (วินาที) เช่น
`HIDE_TIME=5 npm start` (PowerShell: `$env:HIDE_TIME=5; npm start`)

## ขึ้นเซิร์ฟเวอร์ฟรี (Render.com)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kedsuda/HIDE-TROLL)

กดปุ่มด้านบน → ล็อกอิน Render → กด **Deploy Blueprint** ได้เลย หรือทำเองตามขั้นตอน:

1. อัปโหลดโฟลเดอร์นี้ขึ้น GitHub
2. ไปที่ https://render.com → **New → Blueprint** → เลือก repo (มี `render.yaml` ให้แล้ว)
   หรือ **New → Web Service**: Build `npm install`, Start `npm start`, Plan `Free`
3. ได้ลิงก์ `https://hide-and-troll.onrender.com` ส่งให้เพื่อนเล่นได้เลย

หมายเหตุ: แพลนฟรีจะหลับเมื่อไม่มีคนใช้ ~15 นาที เข้าครั้งแรกอาจรอ 30–60 วินาที

## วิธีเล่น

| | คอมพิวเตอร์ | มือถือ |
|---|---|---|
| เดิน / กระโดด | WASD / Space | จอยซ้าย / ปุ่ม ⤒ |
| หมุนกล้อง | เมาส์ (คลิกจอเพื่อล็อกเมาส์) | ลากนิ้วด้านขวา |
| แปลงร่าง (ฝ่ายซ่อน) | เล็งของแล้วกด E / คลิก | ปุ่ม 🪄 |
| ยิง (ฝ่ายล่า) | คลิก / E | ปุ่ม 🎯 |
| เก็บดาว / เปิดหีบภารกิจ (ฝ่ายซ่อน) | เดินเข้าใกล้แล้วกด E | แตะปุ่มเก็บ |
| ล่องหน 6 วิ | Q | 👻 |
| สร้างตัวปลอม | F | 🎭 |
| วิ่งเร็วชั่วคราว | Shift | ⚡ |
| ยั่วยุ (+เหรียญ) | T | 😜 |
| ล็อกการหมุน / กลับร่าง | R / Z | 🔒 / ↩️ |
| สลับมุมกล้อง | V | เมนู ☰ |
| แชต | Enter | ช่องแชตมุมบน |

**กติกา:** ฝ่ายซ่อนมี 30 วินาทีหาที่ซ่อน (ฝ่ายล่าจอมืด) → ฝ่ายล่ามี 5 นาที
ยิงผิดของจริงเสีย 5 HP (หมดแล้วมึน 5 วิ) • คนที่ถูกจับกลายเป็นฝ่ายล่า • จับไม่หมด = ฝ่ายซ่อนชนะ
จำนวนฝ่ายล่า: 2–4 คน = 1, 5–7 คน = 2, 8–10 คน = 3 • เล่นคนเดียว = โหมดฝึกซ้อม

**เหรียญ:** จับได้ +20 • รอดจนจบ +50 • ฝ่ายล่าชนะ +40 • ตัวปลอมหลอกสำเร็จ +10 • ยั่วยุ +2 • จบรอบ +10
ฝ่ายซ่อนเก็บดาวครบ 3 ดวงหรือเปิดหีบสมบัติระหว่างช่วงล่า รับโบนัส +30 เหรียญ แต่ต้องออกจากที่ซ่อนเพื่อไปเก็บ
ใช้ซื้อสีตัวละครและหมวกในร้านสกิน (เก็บในเครื่องผู้เล่น)

## โครงสร้างโค้ด

```
server/server.js      เซิร์ฟเวอร์: ห้อง, รหัสห้อง, สุ่มผู้ล่า, เวลา, สกิล, ตรวจการจับ, เหรียญ
public/index.html     หน้าเว็บ + UI ทั้งหมด
public/css/style.css  สไตล์การ์ตูน + เลย์เอาต์มือถือ
public/js/main.js     เชื่อม UI ↔ เซิร์ฟเวอร์ ↔ เกม, ร้านสกิน, แชต
public/js/game.js     เอนจิน 3D: การเดิน/ชน, กล้อง, แปลงร่าง, ยิง, เอฟเฟกต์
public/js/maps.js     สร้างแผนที่สุ่ม (บ้านผีสิง / ซูเปอร์มาร์เก็ต / โรงเรียน)
public/js/props.js    สิ่งของ 25 ชนิดที่แปลงร่างได้
public/js/character.js ตัวละคร + สกิน + หมวก
public/js/input.js    คีย์บอร์ด/เมาส์/จอยสัมผัส
public/js/audio.js    เสียงเอฟเฟกต์ (สังเคราะห์ ไม่ต้องใช้ไฟล์)
```

## แอป Android (APK)

ดาวน์โหลดได้จาก GitHub Releases: https://github.com/kedsuda/HIDE-TROLL/releases/latest
แอปจะต่อเซิร์ฟเวอร์ตาม `DEFAULT_SERVER` ใน `public/js/config.js`
(เปลี่ยนเองได้ในแอป ช่อง "🌐 เซิร์ฟเวอร์เกม" ที่หน้าเมนู)

สร้าง APK ใหม่ (ต้องมี Android Studio/SDK + JDK 17):

```bash
npm run apk
# ได้ไฟล์ android/app/build/outputs/apk/release/app-release.apk
```

APK เซ็นด้วยกุญแจ `android/hide-and-troll.keystore` + `android/keystore.properties`
(**อยู่ในเครื่องเท่านั้น ไม่ขึ้น GitHub — สำรองไว้ให้ดี** ถ้าหาย จะอัปเดตแอปทับเครื่องที่ติดตั้งไว้ไม่ได้)

ติดตั้งบนมือถือ (ทดสอบแล้วบน POCO C71 / Android 15 Go):
1. เปิดไฟล์ APK → อนุญาตให้ติดตั้งจากแหล่งนี้
2. Play Protect "ขอแนะนำให้สแกนแอป" → กด **สแกนแอป** (~15 วินาที)
3. "แอปนี้ดูปลอดภัย" → กด **ติดตั้ง**

มือถือ Android Go ไม่มีเมนู "ติดตั้งแอป"/"เพิ่มลงในหน้าจอหลัก" ใน Chrome จึงต้องใช้ APK

> โฟลเดอร์ชื่อมี `&` ทำให้ `gradlew.bat` บางครั้งรันไม่ได้ ถ้าเจอให้ใช้ Git Bash:
> `npm run cap:sync && cd android && ./gradlew assembleRelease`

## ขั้นต่อไป

- บัญชีผู้เล่น + เก็บเหรียญบนเซิร์ฟเวอร์ (ตอนนี้เก็บใน localStorage)
- APK แบบ release (เซ็นด้วย keystore) สำหรับลง Play Store


## Party update

- ฝ่ายซ่อนวางกล้วยด้วย `1`, พื้นลื่นด้วย `2`, ควันด้วย `3` หรือปุ่มบนจอ มีคูลดาวน์แยกกัน กับดักอยู่ 30 วินาทีและทำงานเมื่อฝ่ายล่าเดินใกล้ กล้วยหยุดการเคลื่อนไหว 2.2 วินาที พื้นลื่นลดการควบคุม 3 วินาที ควันบดบังบริเวณนั้น 6 วินาที
- เมื่อถูกจับ เลือกช่วยฝ่ายล่าหรือเป็นผีได้ครั้งเดียวต่อรอบ ผีบินด้วยการมองขึ้น/ลงแล้วเดินหน้า ทะลุฉากได้และไม่มีปฏิสัมพันธ์กับฝ่ายที่ยังเล่นอยู่
- เพิ่มโรงเรียนร้าง โรงพยาบาลผีสิง และสวนสนุกกลางคืน ไฟดับสุ่มจากเซิร์ฟเวอร์พร้อมเสียงหลอน โดยยังเลือกแผนที่เดิมได้
- กล่องสุ่มราคา 100 เหรียญในร้าน ได้หมวก สี หรือเอฟเฟกต์ที่ยังไม่มี โอกาสเท่ากันในรายการที่เหลือ ไม่หักเหรียญเมื่อสะสมครบ ไม่มีการซื้อด้วยเงินจริง
- ได้ XP และสถิติชนะหลังจบรอบจริง (โหมดฝึกไม่ให้รางวัล) ทุก 200 XP เพิ่มหนึ่งเลเวล ฉายาเปลี่ยนที่เลเวล 5 และ 10 อันดับในห้องเรียงตามเวลาซ่อนสะสมของผู้เล่นที่ยังอยู่ในห้อง รีเซ็ตเมื่อออกห้อง
- เมนูเสียง/สถิติด้านซ้ายเปิดไมค์ ปิดไมค์ ปิดเสียงรายคนหรือทั้งหมด และเลือกเสียงตามระยะได้ ไมค์เริ่มปิด ผู้ถูกปิดไมค์ยังฟังเพื่อนได้ ผีส่งเสียงให้เฉพาะผีเพื่อป้องกันการบอกจุดซ่อน

### Voice and persistence limitations

Voice uses opt-in WebRTC audio with room-scoped Socket.IO signaling. Microphone access requires HTTPS (or localhost) and browser permission. The default STUN server supports direct peer connections; restrictive NAT/firewalls may require a TURN service, which is not bundled. Test actual audio on two devices and target networks before release; automated tests cover signaling isolation, not real microphone audio. Android microphone permissions and WebView behavior also require device testing.

Coins, inventory and lifetime XP/win statistics retain the existing local-save/Google-save model. They are not cheat-proof: cloud saves accept client progress. Room rankings are computed by the server. Server JSON saves require persistent DATA_DIR storage to survive ephemeral hosting redeployments.

Run `npm test` for the multiplayer integration check and `npm run build` to refresh the Android web assets. The APK is not rebuilt by this update.
