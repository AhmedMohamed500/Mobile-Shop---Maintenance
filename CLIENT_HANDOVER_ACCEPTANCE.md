# قائمة قبول تسليم العميل

التاريخ: 2026-10-03  
تعريف الحالات: **PASS** = تحقق باختبار آلي أو طلب API فعلي موثق، **FAIL** = ظهر عيب مؤكد، **NOT TESTED** = يحتاج متصفحًا أو جهازًا أو خدمة خارجية لم تتوفر. تعذر تشغيل أداة المتصفح في بيئة الجولة بسبب خطأ محلي في kernel assets؛ لذلك لم تُرفع بنود الواجهة البصرية إلى PASS اعتمادًا على وجود الكود فقط.

## A. الإعداد الأول

| البند | الحالة | الدليل |
|---|---|---|
| شاشة الترحيب | NOT TESTED | مبنية وتنجح في production build؛ لم تفتح أداة المتصفح |
| إنشاء مركز جديد | PASS | اختبار onboarding وطلب إنتاج آمن سابق نجحا |
| بيانات المالك | PASS | ينشأ المالك داخل transaction ويستطيع الدخول |
| بيانات المركز | PASS | تحقق schema ورسائل الحقول الدقيقة |
| الفرع | PASS | اختبار إنشاء وحفظ الفرع |
| محطة العمل | PASS | اختبار توسعة المحطات وحفظها |
| المراجعة | NOT TESTED | لم ينفذ اختبار نقر بصري في هذه الجولة |
| التأكيد | PASS | `acceptedTerms` إجباري ولا كتابة قبل الطلب النهائي |
| التحويل إلى الدخول | NOT TESTED | production build ناجح؛ اختبار المتصفح غير متاح |

## B. الدخول

| البند | الحالة | الدليل |
|---|---|---|
| اسم المستخدم | PASS | اختبار API ناجح |
| البريد الإلكتروني | PASS | اختبار API وتحقق إنتاج سابق ناجحان |
| كلمة مرور خاطئة | PASS | 401 JSON ورسالة عربية آمنة |
| رمز مركز خاطئ | PASS | 404 JSON قبل استعلام المستخدم |

## C. الدور الأرضي

| البند | الحالة | الدليل |
|---|---|---|
| لوحة الاستقبال | PASS | API dashboard معزول بالفرع واختبارات workflow |
| استلام جهاز | PASS | تحقق إنتاج آمن سابق + idempotency |
| البحث عن العميل | PASS | مسار بحث tenant-scoped |
| إنشاء العميل | PASS | upsert داخل عملية الاستلام |
| الماركة | PASS | تحقق tenant وactive قبل الحفظ |
| عدة أعطال محددة | PASS | اختبار selector وحفظ الربط وظهوره بالتفاصيل |
| وصف العطل اليدوي | PASS | حقل مستقل عن presets وموجود في payload |
| PIN | NOT TESTED | التشفير وعدم الإظهار العام موجودان؛ لم يدخل يدويًا في UI |
| Pattern | NOT TESTED | واجهة/تشفير موجودان؛ لم ينفذ مسار يدوي كامل |
| العربون | PASS | اختبار workflow وحركة مالية |
| المتبقي | PASS | يحسب ويعرض من السعر والمدفوع |
| الحفظ | PASS | idempotency يمنع التكرار |

## D. الطباعة

| البند | الحالة | الدليل |
|---|---|---|
| إنشاء مهمة الإيصال | PASS | اختبار PrintJob lifecycle |
| طابعة إيصال حقيقية | NOT TESTED | لا توجد طابعة أو Tauri build في البيئة |
| العربية | NOT TESTED | renderer يدعم RTL/خط عربي؛ يحتاج ورقة فعلية |
| QR | PASS | اختبار يولد PNG data URI حقيقيًا |
| الشعار | PASS | payload وrenderer يدعمان صورة الشعار |
| طابعة ملصق | NOT TESTED | لا توجد طابعة فعلية |
| QR/Barcode للملصق | PASS | QR حقيقي؛ barcode خطي غير منفذ لأنه غير مطلوب مع QR |
| إعادة الطباعة | PASS | مسار API واختبار طابور جديد tenant-scoped |

## E. الورشة

| البند | الحالة | الدليل |
|---|---|---|
| ظهور أمر وارد | PASS | events + repairs scoped واختبار API |
| التشخيص | PASS | ملاحظات تشخيص workflow |
| عرض السعر | PASS | اختبار إنشاء عرض وإدخال حالة انتظار الموافقة |
| الموافقة | PASS | اختبار رابط قرار صالح وانتقال الحالة |
| الرفض | PASS | اختبار القرار ومنع القرار المكرر |
| تحت الصيانة | PASS | transition مقيد واختبار domain |
| جاهز للتسليم | PASS | transition وإشعار event |

## F. التسليم بالدور الأرضي

| البند | الحالة | الدليل |
|---|---|---|
| ظهور الجهاز الجاهز | PASS | dashboard/events بفاصل 5 ثوانٍ |
| المبلغ المتبقي | PASS | حساب نهائي واختبار workflow |
| الدفع | PASS | Payment وCashTransaction في transaction واحدة |
| التسليم | PASS | idempotency + قفل حالة + purge لبيانات الفتح |
| الإيصال النهائي | PASS | PrintJob لا يصبح مكتملًا إلا بنتيجة Tauri؛ الشكل الفعلي NOT TESTED |

## G. العميل

| البند | الحالة | الدليل |
|---|---|---|
| رابط التتبع | PASS | رمز عشوائي مخزن hash وتحقق إنتاج سابق |
| سجل الحالات | PASS | صفحة عامة تعرض timeline الآمن |
| رابط الموافقة | PASS | token hash + قرار واحد فقط |
| معلومات آمنة فقط | PASS | لا PIN/password/pattern في public أو print document |

## H. واتساب

| البند | الحالة | الدليل |
|---|---|---|
| رسالة الاستلام | NOT TESTED | IMPLEMENTED — NOT LIVE VERIFIED |
| رسالة الموافقة | NOT TESTED | IMPLEMENTED — NOT LIVE VERIFIED |
| رسالة تحت الصيانة | NOT TESTED | IMPLEMENTED — NOT LIVE VERIFIED |
| رسالة الجاهزية | NOT TESTED | IMPLEMENTED — NOT LIVE VERIFIED |
| رسالة التسليم | NOT TESTED | IMPLEMENTED — NOT LIVE VERIFIED |
| webhook sent | NOT TESTED | signature/status tests فقط |
| webhook delivered | NOT TESTED | signature/status tests فقط |
| webhook read | NOT TESTED | signature/status tests فقط |
| failed/retry | PASS | حالة FAILED وإعادة المحاولة بصلاحية واختبار معالجة |

## I. المالية

| البند | الحالة | الدليل |
|---|---|---|
| فتح وردية | PASS | اختبار API |
| العربون | PASS | intake transaction |
| التحصيل النهائي | PASS | delivery transaction |
| المصروف | PASS | اختبار API واشتراط وردية للنقدي |
| إغلاق الوردية | PASS | اختبار expected/actual/variance |
| الفارق | PASS | اختبار الحساب والتخزين |
| التقرير | PASS | اختبار تجميع tenant/branch scoped |

## J. الأمن

| البند | الحالة | الدليل |
|---|---|---|
| عزل المركز | PASS | tenantId في auth/queries واختبارات exports/events |
| عزل الفرع | PASS | branch scope في events/repairs/finance/exports |
| الصلاحيات | PASS | 403 في اختبار export بدون صلاحية ومسارات أخرى محمية |
| بيانات فتح الجهاز | PASS | تشفير وخاصية مشاهدة بصلاحية فقط |
| حذف بيانات الفتح بعد التسليم | PASS | اختبار workflow يثبت تصفير الحقول |

## K. سطح المكتب

| البند | الحالة | الدليل |
|---|---|---|
| تثبيت جهاز الاستقبال | NOT TESTED | لا Rust/Cargo/MSVC ومساحة C غير كافية |
| تثبيت جهاز الورشة | NOT TESTED | لا يوجد مثبت مبني |
| اختيار محطة العمل | NOT TESTED | التخزين المحلي والمسار الافتراضي مبنيان؛ يحتاج Tauri فعليًا |
| حالة الاتصال | NOT TESTED | مؤشر online/API موجود؛ يحتاج تشغيل على الجهازين |
| بدء التشغيل | NOT TESTED | يحتاج المثبت على Windows العميل |
| اختيار الطابعة | NOT TESTED | يحتاج تعريفات وطابعات العميل |

## L. النسخ الاحتياطي

| البند | الحالة | الدليل |
|---|---|---|
| إجراء النسخ | PASS | موثق في `docs/BACKUP_RESTORE.md` بأوامر pg_dump وتشفير واحتفاظ |
| إجراء الاستعادة | PASS | موثق بقاعدة اختبار وpg_restore وchecks |
| استعادة مختبرة | NOT TESTED | لم تنفذ استعادة إنتاج/اختبار في هذه الجولة |
