# 🏘️ قرية Pi - Pi Village

<div align="center">

![Pi Village Banner](https://via.placeholder.com/800x200/0f0f1a/f9a826?text=Pi+Village)

**أول سوق عربي لامركزي 0% عمولة - مجتمع يبني نفسه من الصفر**

[![Pi Network](https://img.shields.io/badge/Pi%20Network-Integrated-f9a826?style=for-the-badge)](https://minepi.com)
[![Cloudflare](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Workers-F38020?style=for-the-badge)](https://workers.cloudflare.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)]()
[![Version](https://img.shields.io/badge/Version-2.6.1-blue?style=for-the-badge)]()

[🚀 عرض حي](https://pivillage.com) • [📖 التوثيق](#-التوثيق) • [💬 المجتمع](https://t.me/pivillage) • [🐛 الإبلاغ عن مشكلة](https://github.com/ahmedkamel-73/pivillage/issues)

</div>

---

## 📖 عن المشروع

**قرية Pi** ليست مجرد سوق إلكتروني. هي تجربة اجتماعية واقتصادية لإنشاء قرية رقمية كاملة، حيث كل تاجر يبني شارعه، وكل مشتري يصبح جار.

بدأت الفكرة من سؤال بسيط: لماذا ندفع 15-30% عمولة لمنصات لا تعرفنا؟ لماذا لا نبني سوقنا الخاص، بقوانيننا، بعملتنا؟

### 🎯 الرؤية

> قرية رقمية مستقلة، بلا وسطاء، بلا عمولات، يحكمها مجتمعها.

---

## ✨ لماذا قرية Pi؟

### للمشتري 🛒
| الميزة | الوصف |
|--------|-------|
| **0% عمولة** | السعر اللي تشوفه هو اللي تدفعه، بلا زيادة |
| **دفع آمن بـ Pi** | مدعوم من Pi Network الرسمي، مع نظام ضمان متكامل |
| **تجار حقيقيون** | كل تاجر موثق عبر Pi، تقييمات شفافة من المجتمع |
| **قرية حية** | تصميم تفاعلي يحاكي المشي في شوارع القرية |

### للبائع 🏪
| الميزة | الوصف |
|--------|-------|
| **متجرك في دقائق** | افتح متجرك، اختر شارعك، ابدأ البيع فوراً |
| **0% عمولة للأبد** | أرباحك كاملة لك، نحن لا نأخذ شيئاً |
| **نظام ضمان ذكي** | نحميك من المشترين الوهميين ونضمن حقك |
| **مجتمع داعم** | عملاء يأتون لأنهم يؤمنون بالفكرة، ليس فقط بالسعر |

### للمجتمع 🤝
- **لامركزية حقيقية:** القرية ملك لأهلها، القرارات تُتخذ بالتصويت
- **شفافية كاملة:** الكود مفتوح المصدر، كل شيء قابل للتدقيق
- **اقتصاد دائري:** Pi يبقى داخل المجتمع وينمو معه

---

## 🛠️ التقنيات المستخدمة

<table>
<tr>
<td><strong>الواجهة الأمامية</strong></td>
<td>React 18, Tailwind CSS, Pi SDK 2.0, PWA</td>
</tr>
<tr>
<td><strong>الخلفية</strong></td>
<td>Cloudflare Workers, D1 Database, R2 Storage</td>
</tr>
<tr>
<td><strong>المدفوعات</strong></td>
<td>Pi Network Payments API, Escrow System</td>
</tr>
<tr>
<td><strong>الأمان</strong></td>
<td>JWT, Rate Limiting, Audit Logging</td>
</tr>
</table>

### 🏗️ هيكلة المشروع

```
pivillage/
├── src/
│   ├── components/     # مكونات الواجهة
│   ├── pages/          # صفحات القرية
│   ├── hooks/          # React Hooks مخصصة
│   ├── utils/          # أدوات مساعدة
│   └── styles/         # ملفات التصميم
├── workers/            # Cloudflare Workers (API)
├── public/             # ملفات PWA والأيقونات
├── schema/             # مخطط قاعدة البيانات
└── docs/               # التوثيق الداخلي
```

---

## 🚀 البدء السريع

### المتطلبات
- Node.js 18+
- حساب Cloudflare
- حساب Pi Developer (للمدفوعات)

### التثبيت

```bash
# 1. استنساخ المشروع
git clone https://github.com/ahmedkamel-73/pivillage.git
cd pivillage

# 2. تثبيت الحزم
npm install

# 3. إعداد البيئة
cp .env.example .env
# قم بتعبئة المتغيرات المطلوبة في ملف .env

# 4. تشغيل محلياً
npm run dev
```

### إعداد قاعدة البيانات

```bash
# إنشاء قاعدة البيانات
npx wrangler d1 create pi-village-db

# تطبيق المخطط
npx wrangler d1 execute pi-village-db --file=./schema/schema.sql

# إعداد الأسرار
npx wrangler secret put PI_API_KEY
```

---

## 🔌 واجهة برمجة التطبيقات (API)

### المصادقة
كل الطلبات المحمية تتطلب `Authorization: Bearer <token>`

### النقاط الرئيسية

#### المتاجر
```http
GET    /api/shops          # قائمة المتاجر
POST   /api/shops          # إنشاء متجر جديد (يتطلب تسجيل دخول)
GET    /api/shops/:id      # تفاصيل متجر
```

#### المنتجات
```http
GET    /api/products?shop=:id
POST   /api/products       # إضافة منتج (لصاحب المتجر فقط)
```

#### الطلبات والضمان
```http
POST   /api/orders              # إنشاء طلب جديد
POST   /api/escrow/:action      # إجراءات الضمان
  - seller_delivered
  - buyer_confirm
  - buyer_dispute
```

#### مدفوعات Pi
```http
POST   /pi/approve     # موافقة على الدفع
POST   /pi/complete    # إكمال الدفع والتحقق
```

> 📚 التوثيق الكامل: [docs/API.md](docs/API.md)

---

## 🗺️ خريطة الطريق

### ✅ تم (v2.6)
- [x] نظام متاجر ديناميكي وشوارع تفاعلية
- [x] مصادقة Pi Network
- [x] نظام ضمان (Escrow) كامل
- [x] دفع بـ Pi مع التحقق
- [x] PWA جاهز للتثبيت

### 🚧 قيد العمل (v3.0)
- [ ] نظام تقييمات ومراجعات
- [ ] دردشة مباشرة بين المشتري والبائع
- [ ] خريطة قرية تفاعلية 3D
- [ ] تطبيق جوال (React Native)

### 🔮 المستقبل (v4.0)
- [ ] حوكمة لامركزية (تصويت المجتمع)
- [ ] نظام مزادات
- [ ] سوق الخدمات (ليس فقط المنتجات)

---

## 🤝 كيف تساهم؟

نرحب بكل المساهمات! سواء كنت مطور، مصمم، أو حتى صاحب فكرة.

1.  اعمل Fork للمشروع
2.  أنشئ فرع جديد (`git checkout -b feature/amazing-feature`)
3.  اعمل Commit (`git commit -m 'Add amazing feature'`)
4.  ادفع الفرع (`git push origin feature/amazing-feature`)
5.  افتح Pull Request

راجع [CONTRIBUTING.md](CONTRIBUTING.md) للتفاصيل الكاملة.

### للمصممين
لدينا Figma مفتوح، يمكنك اقتراح تحسينات للواجهة.

### للتجار
جرب المنصة وأعطنا رأيك، احتياجاتك هي أولويتنا.

---

## 🔒 الأمان

نأخذ الأمان بجدية. إذا وجدت ثغرة، **لا تفتح Issue عامة**.

راسلنا مباشرة: `security@pivillage.com`

راجع [SECURITY.md](SECURITY.md) لسياسة الإبلاغ.

---

## ❓ أسئلة شائعة

**هل القرية مجانية حقاً؟**
نعم، 0% عمولة حالياً وإلى الأبد للمتاجر المبكرة. نخطط لنموذج مستدام لاحقاً لا يمس التاجر الصغير.

**هل أحتاج Pi لاستخدام القرية؟**
للشراء نعم، للتصفح لا. يمكنك استكشاف القرية كزائر.

**أين تُخزن بياناتي؟**
على Cloudflare (أوروبا/أمريكا) مشفرة، لا نبيع بياناتك أبداً.

**هل الكود مفتوح المصدر؟**
الواجهة نعم، الخلفية جزئياً لأسباب أمنية.

---

## 📄 الترخيص

هذا المشروع مرخص تحت رخصة MIT - راجع ملف [LICENSE](LICENSE) للتفاصيل.

---

## 💌 تواصل معنا

- **المؤسس:** أحمد كامل - [@ahmedkamel-73](https://github.com/ahmedkamel-73)
- **تليجرام:** [t.me/pivillage](https://t.me/pivillage)
- **تويتر:** [@PiVillageHQ](https://twitter.com)
- **البريد:** hello@pivillage.com

---

<div align="center">

**بُنيت بواسطة المجتمع - لمجتمع Pi Network**

*قرية Pi - حيث كل متجر هو بيت، وكل عميل هو جار.*

⭐ إذا أعجبتك الفكرة، لا تنسَ عمل Star للمشروع!

</div>
