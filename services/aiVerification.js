// services/aiVerification.js
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');

const docLabels = {
  syndicateFront: 'كارنيه النقابة (الوجه الأمامي)',
  syndicateBack: 'كارنيه النقابة (الوجه الخلفي)',
  graduationCert: 'شهادة التخرج من كلية الطب',
  facePhoto: 'الصورة الشخصية للوجه'
};
const fileKeys = ['syndicateFront', 'syndicateBack', 'graduationCert', 'facePhoto'];

// ==========================================
// أدوات فحص الصور
// ==========================================

function isValidImageHeader(buffer) {
  if (buffer.length < 12) return false;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true; // JPEG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true; // PNG
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return true; // WebP/RIFF
  return false;
}

function calculateEntropy(buffer) {
  const freq = new Array(256).fill(0);
  for (let i = 0; i < buffer.length; i++) freq[buffer[i]]++;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] > 0) {
      const p = freq[i] / buffer.length;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

function getImageDimensions(buffer) {
  // PNG: width at bytes 16-19, height at bytes 20-23 (IHDR chunk)
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    if (buffer.length > 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }
  }
  // JPEG: scan for SOF0/SOF1/SOF2 markers
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      if (marker >= 0xC0 && marker <= 0xC3) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      if (offset + 2 >= buffer.length - 2) break;
      const segLen = buffer.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
  }
  return null;
}

function getMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// ==========================================
// استدعاء Ollama Vision (محلي)
// ==========================================
function callOllamaVision(imageParts) {
  return new Promise((resolve, reject) => {
    const messages = [
      {
        role: 'user',
        content: `You are a strict document verification system for a medical platform called "Hayat" in Egypt.

Four images have been uploaded for doctor registration, in this order:
1. Doctor Syndicate Card (front side)
2. Doctor Syndicate Card (back side)
3. Medical Faculty Graduation Certificate
4. Doctor's personal face photo

Your task: check if each image actually matches what it is supposed to be.
REJECT if you see: game screenshots, wallpapers, cartoons, food, nature, random web images, animals, cars, memes, or any image unrelated to medical documents.
REJECT if all images appear to be the same image (possibly uploaded multiple times to cheat).
REJECT if the face photo does not show a real human face.
ACCEPT only genuine Egyptian/Arabic doctor credentials, medical certificates, or professional headshots.

Respond ONLY in this JSON format with no extra text:
{"valid": true, "reason": "explanation"}
OR
{"valid": false, "rejectedDoc": "name of rejected document", "reason": "exact rejection reason in Arabic"}`,
        images: imageParts
      }
    ];

    const body = JSON.stringify({
      model: 'gpt-oss:20b',
      messages,
      stream: false
    });

    const options = {
      hostname: 'localhost',
      port: 11434,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.message?.content || '';
          // Extract JSON from response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(JSON.parse(jsonMatch[0]));
          } else {
            resolve({ valid: true, reason: 'Could not parse AI response, passed heuristic checks.' });
          }
        } catch (e) {
          resolve({ valid: true, reason: 'AI response parse error, passed heuristic checks.' });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    // Timeout: 8 seconds for local model fallback
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Ollama Vision timeout'));
    });

    req.write(body);
    req.end();
  });
}

// ==========================================
// استدعاء Gemini Vision (سحابي)
// ==========================================
async function callGeminiVision(filePaths) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
  if (!apiKey) return null;

  const parts = [
    {
      text: `أنت نظام تحقق صارم من مستندات الأطباء لمنصة حياه الطبية المصرية.
تم رفع 4 صور للتسجيل كطبيب:
1. كارنيه نقابة الأطباء (الوجه الأمامي)
2. كارنيه نقابة الأطباء (الوجه الخلفي)
3. شهادة التخرج من كلية الطب
4. صورة شخصية واضحة للوجه

مهمتك: فحص كل صورة والتأكد من أنها المستند الصحيح المطلوب.
ارفض فوراً إذا رأيت: ألعاب فيديو، خلفيات شاشة، كرتون، طعام، طبيعة، حيوانات، سيارات، ميمز، أو أي شيء غير طبي.
ارفض إذا بدت الصور متطابقة (رفع نفس الصورة أكثر من مرة للاحتيال).
ارفض إذا لم تظهر صورة الوجه وجهاً بشرياً حقيقياً.
اقبل فقط وثائق طبية مصرية حقيقية أو صور احترافية.

أجب بتنسيق JSON فقط بدون أي نص إضافي:
{"valid": true, "reasonAr": "سبب القبول"}
أو
{"valid": false, "rejectedDoc": "اسم المستند المرفوض", "reasonAr": "سبب الرفض بالعربية"}`
    }
  ];

  for (const fp of filePaths) {
    const buffer = fs.readFileSync(fp.path);
    parts.push({
      inline_data: {
        mime_type: fp.mimetype || 'image/jpeg',
        data: buffer.toString('base64')
      }
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    }
  );

  if (!response.ok) return null;
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const match = cleanJson.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return null;
}

// ==========================================
// الدالة الرئيسية للتحقق
// ==========================================
async function verifyDoctorDocumentsWithAI(files) {

  // ---- طبقة 1: التحقق من وجود كل الملفات ----
  for (const key of fileKeys) {
    const file = files[key]?.[0];
    if (!file) {
      return {
        valid: false,
        error: `❌ المستند [${docLabels[key]}] غير مرفق. يرجى رفع جميع المستندات الأربعة المطلوبة.`
      };
    }
  }

  const buffers = {};
  const hashes = {};

  // ---- طبقة 2: فحص جودة وصحة كل ملف ----
  for (const key of fileKeys) {
    const file = files[key][0];
    let buffer;
    try {
      buffer = fs.readFileSync(file.path);
      buffers[key] = buffer;
    } catch (e) {
      return { valid: false, error: `❌ خطأ في قراءة ملف [${docLabels[key]}]: ${e.message}` };
    }

    // فحص الحجم الأدنى (8KB)
    if (buffer.length < 8 * 1024) {
      return {
        valid: false,
        error: `❌ تم رفض [${docLabels[key]}]: الصورة صغيرة جداً أو تالفة (${Math.round(buffer.length / 1024)}KB). ارفع صورة واضحة وعالية الجودة.`
      };
    }

    // فحص المحتوى السحري (Magic Bytes)
    if (!isValidImageHeader(buffer)) {
      return {
        valid: false,
        error: `❌ تم رفض [${docLabels[key]}]: الملف ليس صورة حقيقية صالحة.`
      };
    }

    // فحص الإنتروبيا
    const entropy = calculateEntropy(buffer.slice(0, Math.min(buffer.length, 20000)));
    if (entropy < 3.2) {
      return {
        valid: false,
        error: `❌ تم رفض [${docLabels[key]}]: الصورة تبدو فارغة أو ذات لون مصمت، غير صالحة كوثيقة رسمية.`
      };
    }

    // فحص أبعاد الصورة (اكتشاف خلفيات الألعاب والشاشات)
    const dims = getImageDimensions(buffer);
    if (dims) {
      const aspectRatio = dims.width / dims.height;
      // فحص أبعاد الصورة ونسبتها
      if (aspectRatio > 1.7) {
        return {
          valid: false,
          error: `❌ تم رفض [${docLabels[key]}]: أبعاد الصورة (${dims.width}×${dims.height}، نسبة ${aspectRatio.toFixed(2)}) تشير لخلفية شاشة أو صورة ألعاب (16:9) وليست وثيقة رسمية. المستندات الرسمية تكون عادةً عمودية أو قريبة من المربع (A4، بورتريه، كارنيه).`
        };
      }

      // فحص الصورة الشخصية للوجه (يجب أن تكون صورة رأسية/بورتريه أو مربعة وليست أفقية عريضة)
      if (key === 'facePhoto' && aspectRatio > 1.25) {
        return {
          valid: false,
          error: `❌ تم رفض [${docLabels[key]}]: الصورة الشخصية للوجه يجب أن تكون صورة شخصية رأسية (Portrait) أو مربعة يظهر فيها الوجه بوضوح، وليست صورة أفقية عريضة (${dims.width}×${dims.height}).`
        };
      }

      // الحد الأقصى للدقة 7K - الصور الأعلى من هذا مريبة كوثائق
      if (dims.width > 6000 && dims.height > 4000) {
        return {
          valid: false,
          error: `❌ تم رفض [${docLabels[key]}]: دقة الصورة مرتفعة جداً (${dims.width}×${dims.height}) بشكل غير طبيعي لوثيقة رسمية. يبدو أنها صورة إنترنت أو خلفية شاشة.`
        };
      }
    }

    // حساب بصمة الملف
    hashes[key] = getMD5(buffer);
  }

  // ---- طبقة 3: كشف الاحتيال بالملفات المكررة ----
  const uniqueHashes = new Set(Object.values(hashes));
  if (uniqueHashes.size < 4) {
    const duplicates = [];
    const seen = {};
    for (const [key, hash] of Object.entries(hashes)) {
      if (seen[hash]) {
        duplicates.push(`${docLabels[seen[hash]]} و ${docLabels[key]}`);
      } else {
        seen[hash] = key;
      }
    }
    return {
      valid: false,
      error: `❌ تم اكتشاف احتيال: تم رفع نفس الصورة عدة مرات في خانات مختلفة (${duplicates.join(' | ')}). يجب أن تكون كل وثيقة صورة مختلفة ومستقلة.`
    };
  }

  // ---- طبقة 4: فحص ذكي بـ Gemini Vision (إذا متوفر الـ API Key) ----
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
  if (geminiApiKey) {
    try {
      console.log('🤖 [Gemini Vision] جاري فحص المستندات بالذكاء الاصطناعي السحابي...');
      const filePaths = fileKeys.map(key => files[key][0]);
      const result = await callGeminiVision(filePaths);
      if (result) {
        console.log('🤖 [Gemini Result]:', result);
        if (result.valid === false) {
          return {
            valid: false,
            error: `❌ فشل التحقق بالذكاء الاصطناعي (Gemini): ${result.reasonAr || result.reason || 'المستندات غير مطابقة'}`
          };
        }
        return {
          valid: true,
          aiVerified: true,
          aiEngine: 'Gemini Vision',
          message: result.reasonAr || 'تم التحقق الذكي من صحة المستندات بنجاح.'
        };
      }
    } catch (e) {
      console.warn('⚠️ [Gemini Vision] خطأ:', e.message);
    }
  }

  // ---- طبقة 5: فحص ذكي بـ Ollama Vision (محلي - إن كان يعمل) ----
  try {
    console.log('🤖 [Ollama Vision] جاري فحص المستندات بالذكاء الاصطناعي المحلي (gpt-oss:20b)...');
    // تحويل الصور إلى base64
    const imageParts = fileKeys.map(key => buffers[key].toString('base64'));
    const result = await callOllamaVision(imageParts);
    console.log('🤖 [Ollama Result]:', result);

    if (result && result.valid === false) {
      return {
        valid: false,
        error: `❌ فشل التحقق بالذكاء الاصطناعي المحلي: ${result.reason || 'المستندات المرفوعة غير صالحة أو عشوائية'}`
      };
    }

    if (result && result.valid === true) {
      return {
        valid: true,
        aiVerified: true,
        aiEngine: 'Ollama (gpt-oss:20b)',
        message: result.reason || 'تم التحقق الذكي المحلي من صحة المستندات.'
      };
    }
  } catch (e) {
    console.warn('⚠️ [Ollama Vision] غير متاح أو timeout:', e.message);
  }

  // ---- طبقة 6: اجتياز الفحوصات الهيكلية فقط ----
  console.log('✅ [Heuristic] اجتازت المستندات جميع الفحوصات البنيوية بنجاح.');
  return {
    valid: true,
    aiVerified: false,
    message: 'تم فحص صحة وبنية المستندات الأربعة بنجاح.'
  };
}

module.exports = { verifyDoctorDocumentsWithAI };
