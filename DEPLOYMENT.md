# نشر التحديث على Vercel Hobby دون Vercel Cron

المستودع الحالي: `omarmosa2/campaign-flow`، والفرع الافتراضي `master`.
عنوان الإنتاج الحالي: https://campaign-flow-iota.vercel.app

## السلوك النهائي

- يُحفظ الحجز وإشعاره المعاملاتي أولاً في Supabase.
- بعد نجاح الحفظ، ينتظر طلب Next.js محاولة الإرسال إلى UltraMsg وتسجيل نتيجتها قبل إعادة نجاح الحجز.
- فشل واتساب لا يلغي الحجز. لا توجد عمليات إرسال منفصلة غير منتظرة بعد انتهاء طلب Next.js.
- لا توجد جدولة واتساب في `vercel.json`، ولا workflow مجدول لواتساب في GitHub.
- يمكن للمدير إعادة الإرسال الفاشل يدوياً بعد تأكيد احتمال التكرار.
- إعادة المحاولة الآلية وتحديث حالة التسليم يعملان بواسطة Supabase Cron، عند توفر إضافاته وتفعيلها. غيابه لا يعطّل الحجز أو الإرسال المباشر أو الإعادة اليدوية.

## 1. تحديث المشروع الموجود في Vercel

من **Settings → Environment Variables** استورد الملف المحلي الخاص `.env.vercel.local` إلى **Production**. جُهّز هذا الملف من إعداداتك الحالية مع `APP_URL` الخاص بالإنتاج، وهو مستبعد من Git. لا ترفعه إلى المستودع ولا ترسل محتواه في المحادثة. لا تحذف المتغيرات التاريخية الموجودة في Vercel.

المتغيرات المطلوبة:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
APP_URL
ULTRAMSG_INSTANCE_ID
ULTRAMSG_TOKEN
ADMIN_WHATSAPP_NUMBER
ULTRAMSG_API_URL
WHATSAPP_NOTIFICATIONS_ENABLED
CRON_SECRET
```

- `APP_URL=https://campaign-flow-iota.vercel.app`، دون localhost أو مسار إضافي.
- `WHATSAPP_NOTIFICATIONS_ENABLED=true`.
- `CRON_SECRET` عشوائي بطول 32 حرفاً على الأقل؛ يستخدم فقط لحماية عامل إعادة المحاولة.
- لا تستخدم NEXT_PUBLIC لمفتاح UltraMsg أو service_role أو CRON_SECRET.
- يمكن لرقم المدير المحفوظ في لوحة الإدارة تجاوز رقم البيئة الافتراضي.

إعدادات البناء: **Next.js**، **Node.js 22.x**، Install: `npm ci`، Build: `npm run build`، وRoot Directory هو جذر المشروع، مع Output الافتراضي لـ Next.js.

بعد تعديل البيئة انشر التحديث أو اختر **Redeploy**. [توثيق متغيرات Vercel](https://vercel.com/docs/environment-variables).

## 2. قاعدة البيانات الحالية

نُفّذ ترحيل واتساب الأساسي `202611240001_ultramsg_notifications.sql` على قاعدة Supabase المرتبطة محلياً، وتم التحقق من إرسال رسائل تجريبية حقيقية. ملف متغيرات الإنتاج المحضّر يستخدم مشروع Supabase نفسه.

لا تُعد تنفيذ الترحيل الأساسي أو core أو reset على القاعدة القائمة، ولا تُعد إنشاء المدير. إذا اخترت قاعدة إنتاج مختلفة، طبّق الترحيلات اللازمة عليها قبل نشر الكود.

## 3. إعادة المحاولة الاختيارية عبر Supabase Cron

نفّذ مرة واحدة في Supabase SQL Editor:

```text
supabase/migrations/202611240002_whatsapp_supabase_cron.sql
```

يمكن للمدير تنزيل هذا الملف بعد النشر من:

```text
https://campaign-flow-iota.vercel.app/api/admin/whatsapp/migration?kind=cron
```

يحاول الترحيل تمكين `pg_cron` و`pg_net` و`supabase_vault` إذا كانت متاحة. إذا لم يسمح إعداد المشروع بذلك، ينتهي الترحيل مع إشعار وتبقى وظائف الإرسال والحجز عاملة. يمكن تمكين الإضافات المتاحة من Supabase **Integrations / Extensions** ثم إعادة فحص الحالة.

بعد نشر التطبيق وإعداد CRON_SECRET في Vercel، شغّل محلياً:

```powershell
npm run whatsapp:cron:status
npm run whatsapp:cron:setup
```

الأمران يقرآن `.env.vercel.local` الخاص. أمر الإعداد:

1. يتحقق من توفر الإضافات.
2. يتحقق من استجابة عامل الإنتاج المحمي والسر الصحيح قبل تغيير أي جدولة قائمة.
3. يحفظ أصل موقع الإنتاج وسر العامل في Supabase Vault.
4. ينشئ أو يحدّث مهمة واحدة باسم `campaign-flow-whatsapp-retry` تعمل كل دقيقة.

مفتاح UltraMsg لا يُنسخ إلى Vault. نص المهمة لا يتضمن الأسرار؛ يستدعي دالة داخلية تقرأ Vault وترسل رأس `Authorization` إلى `/api/cron/whatsapp`. يظل هذا المسار عاملاً محمياً على Next.js؛ وجود كلمة cron في عنوانه لا يعني استخدام Vercel Cron Jobs. العامل نفسه ينتظر الإرسال وتسجيل النتيجة قبل انتهاء طلب HTTP.

لا يستدعي المجدول العامل عند عدم وجود عمل. المهام الفاشلة المؤقتة تعاد بحد أقصى أربع محاولات وتأخير تدريجي؛ التنفيذ الفعلي يتبع فاصل الدقيقة. النتائج المبهمة لا يعاد إرسالها تلقائياً، والمهام المكررة تمنعها القيود والأقفال الموجودة.

لفحص الحالة أو تعطيل مهمتنا فقط:

```powershell
npm run whatsapp:cron:status
npm run whatsapp:cron:disable
```

لا يغيّر التعطيل المهام الأخرى ولا يوقف الإرسال المباشر. إذا غُيّر CRON_SECRET في Vercel، حدّث قيمته في الملف الخاص وأعد تشغيل `whatsapp:cron:setup` لتحديث Vault.

راجع **Supabase → Integrations → Cron** وسجل `cron.job_run_details` لمراقبة المهمة. قبول `pg_net` لطلب HTTP لا يثبت نجاح إرسال واتساب؛ المرجع هو `whatsapp_notifications` وسجل المزود. تتم إدارة اتصال HTTP بواسطة Supabase خارج عمر طلب الحجز، ويظل صندوق الإشعارات محفوظاً للتشغيل التالي إذا تعطل طلب المجدول.

هذه الإعدادات تستخدم إضافات المشروع القائمة ولا تضيف اشتراكاً أو خدمة مدفوعة. لم يُتحقق من تفعيلها في القاعدة الفعلية قبل تطبيق الترحيل الاختياري؛ لا يفترض التطبيق وجودها. [توثيق Cron](https://supabase.com/docs/guides/cron)، [إعدادات التثبيت](https://supabase.com/docs/guides/cron/install)، [جدولة HTTP مع Vault](https://supabase.com/docs/guides/functions/schedule-functions).

## 4. رفع التحديث

```powershell
git status
git add .
git commit -m "Use direct WhatsApp sends and optional Supabase retries"
git push origin master
```

ملفا `.env.local` و`.env.vercel.local` مستبعدان من Git؛ لا تستخدم `git add -f` لإضافتهما. عند ربط مشروع Vercel بفرع `master` يبدأ النشر تلقائياً بعد push.

لم تتغير إعدادات حساب Vercel أو أسرار الحسابات عن بُعد لعدم وجود اتصال إداري لها في هذه الجلسة. جهّزنا ملفات الكود والإعداد؛ استيراد البيئة في الحساب وتطبيق الترحيل الاختياري مطلوبان للتشغيل الإنتاجي الكامل.

## 5. التحقق بعد النشر

1. افتح `/admin/whatsapp` بعد تسجيل الدخول وتحقق من الاتصال ورقم المستلم.
2. أرسل رسالة تجريبية واحدة؛ راقب القبول ثم الإرسال والتسليم الفعلي إن ورد ACK مناسب.
3. تحقق من حجز فعلي مع إشعار الدفع، ثم من إشعاره في السجل.
4. إذا فعّلت Supabase Cron، تحقق من `whatsapp:cron:status` وسجل تشغيل المهمة.
5. تبقى الإعادة اليدوية متاحة، مع التحذير من تكرار النتائج غير المؤكدة.

للتطوير المحلي، يستمر `npm run dev` بالإرسال المباشر. الأمر `npm run whatsapp:worker` اختياري لفحص المحاولات والحالات محلياً؛ لا تشغّله كحلقة داخل Vercel. Supabase لا يستطيع الوصول إلى localhost، لذلك إعداد مجدوله يقبل عنوان إنتاج HTTPS عاماً فقط.
