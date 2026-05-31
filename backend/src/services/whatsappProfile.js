const sharp = require('sharp');

const GQL = 'https://graph.facebook.com/v19.0';

// ── Upload image buffer and set it as the WA business profile photo ──────────
async function setProfilePhoto(phoneNumberId, accessToken, imageBuffer) {
  // Resize to 640×640 JPEG before upload
  const processed = await sharp(imageBuffer)
    .resize(640, 640, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();

  // Step 1 – upload to WhatsApp Media API
  const form = new FormData();
  form.append('file', new Blob([processed], { type: 'image/jpeg' }), 'profile.jpg');
  form.append('type', 'image/jpeg');
  form.append('messaging_product', 'whatsapp');

  const uploadRes = await fetch(`${GQL}/${phoneNumberId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.id) {
    const msg = uploadData?.error?.message || 'Media upload failed';
    throw new Error(msg);
  }

  // Step 2 – set as profile picture
  const profileRes = await fetch(`${GQL}/${phoneNumberId}/whatsapp_business_profile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', profile_picture_handle: uploadData.id }),
  });

  const profileData = await profileRes.json();
  if (!profileRes.ok) {
    throw new Error(profileData?.error?.message || 'Failed to set profile photo');
  }

  return { success: true, mediaId: uploadData.id };
}

// ── Fetch current WA business profile ────────────────────────────────────────
async function getProfilePhoto(phoneNumberId, accessToken) {
  const fields = 'profile_picture_url,about,description,email,websites,vertical,address,category';
  const res = await fetch(`${GQL}/${phoneNumberId}/whatsapp_business_profile?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Failed to fetch profile');
  // API wraps in { data: [...] }
  return Array.isArray(data.data) ? data.data[0] : data;
}

// ── Update business profile text fields ──────────────────────────────────────
async function updateBusinessProfile(phoneNumberId, accessToken, fields) {
  const allowed = ['about', 'description', 'email', 'websites', 'vertical', 'address'];
  const payload = { messaging_product: 'whatsapp' };
  for (const key of allowed) {
    if (fields[key] !== undefined) payload[key] = fields[key];
  }

  const res = await fetch(`${GQL}/${phoneNumberId}/whatsapp_business_profile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Failed to update profile');
  return { success: true };
}

module.exports = { setProfilePhoto, getProfilePhoto, updateBusinessProfile };
