# النشر والإعداد

## 1. المتطلبات

Node.js 22.12+ وnpm، مشروع Supabase وحساب Vercel. ملف package-lock.json يحفظ الإصدارات المختبرة. لا حاجة إلى VPS أو Docker أو عامل دائم.

## 2. إعداد Supabase

1. أنشئ مشروعاً مستقلاً للإنتاج واختر منطقة مناسبة للمستخدمين.
2. افتح SQL Editor ونفّذ كامل `supabase/migrations/202611180001_core.sql` مرة واحدة على قاعدة جديدة. أو استخدم Supabase CLI بعد ربط المشروع: `supabase db push`.
3. يضيف الترحيل الجداول والدوال والفهارس وRLS وحاوية `private-assets` الخاصة. لا تحولها إلى public ولا تضف سياسات وصول عامة للطلبات أو الدفع.
4. من Authentication عطّل Allow new users / Sign up؛ لا يحتاج العملاء إلى حسابات. عطّل التسجيل من كل مزودي الهوية غير المستخدمين. يظل إنشاء المدير من Auth Admin API متاحاً للخادم.
5. اضبط Site URL على رابط الإنتاج وRedirect URLs على الروابط اللازمة فقط. التطبيق يستخدم تسجيل دخول بكلمة مرور ولا يتطلب callback عام.
6. انسخ Project URL وPublishable Key وService Role Key إلى بيئة الخادم. لا تشارك Service Role ولا تضعه في متغير NEXT_PUBLIC.
7. تأكد من تفعيل RLS على كل جدول ومن أن الحاوية private.

ترحيل الاختبارات يستبدل auth وstorage بهيكل محلي محدود؛ ليس بديلاً عن إجراء الخطوات السابقة واختبار سياسات مشروع Supabase نفسه.

## 3. متغيرات البيئة

انسخ `.env.example` إلى `.env.local` للتطوير. في Vercel أضف القيم من Settings → Environment Variables.

| المتغير | الاستخدام |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | رابط مشروع Supabase |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | المفتاح العام، ليس service_role |
| SUPABASE_SERVICE_ROLE_KEY | خادم فقط؛ قاعدة البيانات والتخزين والإدارة |
| APP_URL | أصل التطبيق الدقيق، مثل `https://your-project.vercel.app`؛ بلا مسار |
| ORDER_TOKEN_SECRET | سر عشوائي ثابت لا يقل عن 32 حرفاً لاشتقاق رموز متابعة الطلب |
| CRON_SECRET | سر طويل لحماية معالجة المهام |
| WHATSAPP_ACCESS_TOKEN | رمز Meta في الخادم |
| WHATSAPP_PHONE_NUMBER_ID | معرّف الرقم المسجل في Meta |
| WHATSAPP_BUSINESS_ACCOUNT_ID | مرجع حساب الأعمال أثناء الإعداد؛ الإرسال يستخدم Phone Number ID |
| WHATSAPP_GRAPH_VERSION | إصدار Graph مدعوم حالياً لتطبيقك؛ لا تتركه فارغاً عند التفعيل |
| META_APP_SECRET | التحقق من توقيع Webhook |
| WHATSAPP_VERIFY_TOKEN | قيمة عشوائية للتحقق الأولي من Webhook |

لتوليد كل سر بصورة مستقلة:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

لا تستخدم أسرار الإنتاج في Preview عام. تطابق APP_URL مهم لحماية Origin. تغيير ORDER_TOKEN_SECRET يؤثر في استعادة الطلب بمفتاح إعادة المحاولة؛ لا تدوّره دون خطة.

## 4. إنشاء المدير الأول

بعد تطبيق الترحيل وإكمال `.env.local`، افتح PowerShell من المشروع. استخدم إدخالاً مخفياً لكلمة المرور ثم متغيراً مؤقتاً:

```powershell
$adminSecret = Read-Host 'كلمة مرور المدير (12 حرفاً على الأقل)' -AsSecureString
$adminPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecret)
try {
  $env:BOOTSTRAP_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPointer)
  npm run admin:create
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPointer)
  Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

يسأل السكربت عن البريد والاسم، وينشئ Auth user وprofile بدور super_admin. يرفض العمل إذا وجد مدير نظام مفعلاً. لا يطبع كلمة المرور. إذا فشل profile يحاول التراجع عن Auth user. بعد الدخول استخدم صفحة الفريق لإضافة المديرين الآخرين. لا تضع كلمة مرور في المستودع أو command history.

## 5. إعداد شام كاش

من `/admin/settings` أدخل صاحب الحساب والمعرّف وتعليمات التحويل والعملة، ثم فعّل استقبال الطلبات. جرب تحويلك الحقيقي إلى الحساب خارج التطبيق. التطبيق لا يطلب معلومات دخول شام كاش ولا يتصل بواجهة دفع آلية. رفع الصورة يضع الطلب في المراجعة فقط.

## 6. النشر على Vercel

1. ارفع المستودع إلى مستودع Git خاص مناسب، ثم Import Project في Vercel واختر Next.js.
2. اضبط Node.js 22 وأمر البناء `npm run build` والتثبيت `npm ci`.
3. أضف البيئة السابقة، واجعل APP_URL أصل الإنتاج النهائي. أعد النشر بعد تعديل المتغيرات.
4. انشر وافحص الدخول وإنشاء حملة وطلب ورفع إشعار باستخدام بيئة إنتاج معزولة قبل استقبال العملاء.
5. لا يكتب التطبيق ملفات العملاء إلى filesystem؛ الرفع مباشرة من Route Handler إلى Supabase Storage الخاص.
6. الحد العملي للملفات في الطلب هنا 4 MB إجمالاً بسبب حدود جسم طلب Vercel Functions. الحاوية تقبل 5 MB كحد أعلى دفاعي، ولا يعني ذلك أن 5 MB تمر عبر الدالة. لا تستخدم فيديو أو ملفات أكبر.

لم ينفذ هذا المشروع نشر Vercel فعلياً لعدم توفير حساب/اعتماد نشر.

## 7. صندوق الإشعارات وCron

يحتوي `vercel.json` على Cron واحد يومياً `0 6 * * *` بتوقيت UTC. اختير تردد يومي مراعاة لحدود Hobby؛ راجع [حدود Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) وخطة الاستخدام التجاري قبل الإطلاق. يتم تشغيل معالجة قصيرة أيضاً عبر Next.js `after()` عقب إنشاء الطلب أو تقديم الإشعار أو اعتماد الدفع. لا تعتمد صحة حفظ الطلب على Meta.

كل دفعة تأخذ حتى 3 مهام بالتوازي، مع مهلة إرسال 15 ثانية وإجمالي maxDuration=60. يمكنك تشغيل المعالجة يدوياً من الإدارة. يعيد Cron اليومي المحاولة عند حلول موعد المهام، وقد تتأخر المحاولة حتى موعده التالي. لسرعة أعلى أو حجم كبير استخدم خطة Vercel المناسبة وعدّل Cron لتردد مدعوم؛ لا تعتبر الإشعارات لحظية مضمونة. عندما يكون Meta غير جاهز لا تُسحب المهام للإرسال.

تضبط Vercel ترويسة `Authorization: Bearer CRON_SECRET`. لا تضع السر في query string. لا حاجة لخادم أو worker دائم.

## 8. النسخ الاحتياطي والاستعادة

- فعّل النسخ الاحتياطي المُدار/PITR وفق خطة Supabase، وحدد RPO/RTO تشغيلياً.
- خذ نسخ PostgreSQL خارجية مشفرة دورياً عبر أدوات Supabase/pg_dump وبصلاحيات محدودة. لا تحفظ كلمات اتصال في المستودع.
- نسخ قاعدة البيانات لا تعني نسخ محتوى Storage؛ انسخ كائنات `private-assets` إلى مخزن مشفر مستقل مع مساراتها ووقت النسخ.
- اختبر الاستعادة إلى مشروع منفصل: قاعدة البيانات أولاً، ثم ملفات Storage بنفس المسارات، ثم متغيرات بيئة اختبار منفصلة.
- عطّل الإرسال واستقبال الطلبات أثناء فحص الاستعادة لتجنب إشعارات أو طلبات مكررة. راجع مهام sending/uncertain يدوياً بعد الاستعادة.
- تحقق من عدد الطلبات والمبالغ حسب العملة وسجلات المراجعة ووجود المرفقات؛ ثم حوّل الرابط عند نجاح اختبار قبول كامل.
- لا تحذف إشعارات التحويل المرتبطة بسجلات مالية. راجع الأصول اليتيمة فقط بعد التأكد أنها غير مرجعية ومن مرور فترة أمان مناسبة، عبر مهمة صيانة مدروسة. لا توجد مهمة حذف تلقائي لملفات العملاء.
