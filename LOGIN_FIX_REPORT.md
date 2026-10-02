# تقرير إصلاح فشل تسجيل الدخول

## النتيجة

تم إصلاح مشكلة تسجيل الدخول ونشر الإصلاح على النسخة الحية:

- التطبيق: https://mobile-shop-maintenance.vercel.app
- المستودع: https://github.com/AhmedMohamed500/Mobile-Shop---Maintenance

## السبب الجذري

كان متغير `VITE_API_URL` غير مضبوط في بناء واجهة سطح المكتب، ولذلك كان العميل يرسل طلب تسجيل الدخول إلى:

```text
/auth/login
```

هذا المسار كان يصل إلى واجهة React/Vite على Vercel بدل خادم الـ API، فتُرجع Vercel استجابة نصية تبدأ بـ:

```text
The page could not be found
```

بعد ذلك كان عميل الواجهة ينفذ `response.json()` مباشرة، مما تسبب في الخطأ:

```text
Unexpected token 'T', "The page c"... is not valid JSON
```

## مسارات تسجيل الدخول الصحيحة

### الإنتاج

```text
POST https://mobile-shop-maintenance.vercel.app/api/auth/login
```

### التطوير المحلي عبر Vite وTauri

```text
POST http://127.0.0.1:5173/api/auth/login
```

يمر الطلب عبر Vite proxy إلى خادم Fastify المحلي:

```text
POST http://127.0.0.1:4000/auth/login
```

> المشروع الحالي يستخدم Fastify وPrisma، ولا يحتوي على Laravel أو PHP أو ملف `artisan`.

## الإصلاحات المنفذة

- ضبط عنوان API الافتراضي على `/api`.
- إضافة Vite proxy للتطوير المحلي وتشغيل Tauri Development.
- فحص `status` و`content-type` قبل تحليل الاستجابة.
- منع عرض HTML أو stack traces للمستخدم.
- عرض رسالة عربية آمنة عند وصول استجابة غير JSON:

```text
تعذر الاتصال بخادم النظام. تأكد من تشغيل الخادم وإعدادات الاتصال.
```

- إضافة خدمة مصادقة تتحقق من صحة شكل جلسة الدخول.
- جعل مسار المصادقة يعيد JSON في حالات النجاح والفشل.
- التحقق الفعلي من رمز مركز الصيانة قبل البحث عن المستخدم.
- إضافة معالجة منفصلة للحالات التالية:
  - بيانات دخول غير صحيحة.
  - رمز مركز صيانة غير صحيح.
  - حساب مركز موقوف.
  - اشتراك منتهي.
  - API غير متاح.
  - خطأ في الخادم.
  - استجابة غير صالحة أو غير JSON.
- استبدال CORS المفتوح بقائمة origins محددة للتطوير وTauri والنطاقات المنشورة.

## بيانات الحساب التجريبي

```text
رمز مركز الصيانة: demo
البريد الإلكتروني: reception@demo.local
كلمة المرور: Demo@12345
رمز الفرع: MAIN
```

تم التأكد من وجود المستخدم في قاعدة البيانات ومن ارتباطه بالمستأجر `demo` والفرع `MAIN` عن طريق تسجيل دخول فعلي ناجح.

## الملفات المعدلة

- `.env.example`
- `.gitignore`
- `apps/api/src/app.ts`
- `apps/api/src/config.ts`
- `apps/api/src/auth.test.ts`
- `apps/desktop/src/App.tsx`
- `apps/desktop/src/api.ts`
- `apps/desktop/src/auth.ts`
- `apps/desktop/src/api.test.ts`
- `apps/desktop/vite.config.ts`

لم يتم تعديل تصميم صفحة تسجيل الدخول أو ملفات CSS.

## الاختبارات المنفذة

- `pnpm test` — نجح.
- `pnpm typecheck` — نجح.
- `pnpm build` — نجح.
- Prisma migration status — قاعدة البيانات محدثة.
- تسجيل دخول صحيح محليًا عبر Vite proxy — `200 application/json`.
- كلمة مرور خاطئة — `401 application/json`.
- رمز مركز غير صحيح — `404 application/json`.
- تسجيل دخول صحيح على الإنتاج — `200 application/json` مع token صالح.
- اختبار CORS للـ origins المسموحة وغير المسموحة — نجح.
- اختبار معالجة استجابة نصية غير JSON في الواجهة — نجح.

## حالة النشر

الإصلاح الأساسي منشور في commit:

```text
e61cf4d6b5208e949f0fc6d6d8f701a960c5e253
```

وتسجيل الدخول يعمل حاليًا على النسخة الحية.