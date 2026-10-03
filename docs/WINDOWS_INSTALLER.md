# بناء مثبت Windows لتطبيق مركز الصيانة

## الحالة الحالية

إعداد Tauri موجود ويطلب حزمتَي NSIS وMSI. لم يُنتج مثبت في بيئة التسليم الحالية لأن `cargo` و`rustc` وMSVC غير مثبتة، والمساحة الحرة على قرص C وقت الفحص كانت نحو 0.04 GB فقط. لا تعتبر هذه الوثيقة دليلًا على اختبار المثبت أو الطابعات فعليًا.

## المتطلبات

1. Windows 10/11 ‏64-bit محدث.
2. مساحة حرة لا تقل عن 15 GB على قرص النظام قبل تثبيت الأدوات والبناء.
3. Node.js LTS وCorepack وpnpm 11.
4. Rust stable بواجهة MSVC.
5. Visual Studio 2022 Build Tools مع workload **Desktop development with C++**.
6. Windows 10/11 SDK وMSVC v143 وC++ CMake tools.
7. WebView2 Runtime مثبت على جهازي العميل.

## إعداد جهاز البناء

افتح PowerShell كمسؤول، وثبت Rust من <https://rustup.rs> ثم نفذ:

```powershell
rustup default stable-msvc
rustup update
rustc --version
cargo --version
```

من Visual Studio Installer ثبت **Build Tools for Visual Studio 2022** وحدد Desktop development with C++ وWindows SDK. أعد تشغيل الطرفية وتحقق من أن `cl.exe` متاح داخل Developer PowerShell.

## تجهيز المشروع

```powershell
git clone https://github.com/AhmedMohamed500/Mobile-Shop---Maintenance.git
cd Mobile-Shop---Maintenance
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
```

أنشئ `E:\Peter\.env.tauri` أو ملفًا مماثلًا في جذر النسخة المحلية، ولا تضف أسرار الخادم إليه:

```dotenv
VITE_API_URL=https://mobile-shop-maintenance.vercel.app/api
```

أسرار قاعدة البيانات وJWT وMeta تبقى في بيئة الخادم/Vercel فقط.

## الفحص والبناء

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm --filter @repair/desktop tauri:build
```

المخرجات المتوقعة:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/*.exe
apps/desktop/src-tauri/target/release/bundle/msi/*.msi
```

وقّع المثبت بشهادة Code Signing قبل توزيعه على العميل إن توفرت.

## التثبيت على جهازي العميل

1. ثبت نفس النسخة الموقعة على جهاز **Reception Ground Floor** وجهاز **Workshop Upper Floor**.
2. شغّل التطبيق وسجّل الدخول بحساب يملك الصلاحيات المناسبة.
3. من الإعدادات ← محطة الطباعة اختر محطة الجهاز: `RECEPTION_DELIVERY` للاستقبال أو `WORKSHOP_MANAGEMENT` للورشة.
4. احفظ المحطة؛ يخزن التطبيق هويتها محليًا لهذا المركز/الفرع ويفتح صفحتها الافتراضية في الدخول التالي، مع بقاء صلاحيات الخادم نافذة.
5. على جهاز الاستقبال اختر طابعة الإيصال 58/80mm وطابعة الملصق، المقاس، النسخ، وخيارات الطباعة التلقائية.
6. نفذ اختبار الإيصال واختبار الملصق. لا تعتمد التشغيل إلا بعد التأكد من العربية وRTL والشعار وQR والمقاس والقص الفعلي.
7. على جهاز الورشة اختر محطة الورشة وأوقف الطباعة التلقائية إن لم توجد طابعة هناك.

## قبول الموقع

سجل اسم وموديل كل طابعة وتعريف Windows، اطبع إيصال 58mm و80mm وملصقًا، امسح QR بهاتف، افصل الشبكة والطابعة ثم تحقق من رسالة الخطأ وإعادة الطباعة. لا يوصف المثبت أو الطابعة بأنها مختبرة حتى إتمام هذه الخطوات على الجهازين الفعليين.
