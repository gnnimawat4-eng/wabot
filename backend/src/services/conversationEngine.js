/**
 * Smart Multi-Level WhatsApp Conversation Engine
 *
 * State machine:
 *   '' / null        → not started
 *   'language_select' → sent welcome, awaiting 1/2/3
 *   'main_menu'       → sent main menu, awaiting 1–4
 *   'sub_menu_1'…'sub_menu_4' → in sub-menu, awaiting 1–4 or 0
 */

const { supabase } = require('./supabase');
const wa          = require('./whatsapp');

const GREETINGS = new Set([
  'hi','hello','hey','hii','helo','helo!','hi!','hello!','hey!',
  'start','menu','namaste','namaskar','hye','hai','howdy','yo',
  'नमस्ते','नमस्कार',
]);
const LANG_MAP = { '1': 'hindi', '2': 'english', '3': 'hinglish' };
const MAIN_OPTIONS = new Set(['1','2','3','4']);

// ── Time-based greeting ────────────────────────────────────────────────────

function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Night';
}

// ── Default menu content (all 3 languages × hotel / restaurant / salon / general) ──

const DEFAULTS = {
  hotel: {
    main: {
      hindi:    'नमस्ते! हम आपकी कैसे मदद कर सकते हैं? 😊\n\n1️⃣ रूम बुकिंग\n2️⃣ चेक-इन / चेक-आउट\n3️⃣ रूम सर्विस\n4️⃣ स्थान और संपर्क\n\n0️⃣ भाषा बदलें',
      english:  'How can we help you today? 😊\n\n1️⃣ Room Booking\n2️⃣ Check-in / Check-out\n3️⃣ Room Service\n4️⃣ Location & Contact\n\n0️⃣ Change language',
      hinglish: 'Aap kaise help chahte hain? 😊\n\n1️⃣ Room Book Karna\n2️⃣ Check-in / Check-out\n3️⃣ Room Service\n4️⃣ Location aur Contact\n\n0️⃣ Language change karo',
    },
    sub: {
      '1': {
        hindi:    '🏨 *रूम बुकिंग*\n\n1️⃣ उपलब्धता जांचें\n2️⃣ स्टैंडर्ड रूम – ₹2,500/रात\n3️⃣ डीलक्स रूम – ₹4,000/रात\n4️⃣ सुइट – ₹7,000/रात\n\n0️⃣ वापस जाएं',
        english:  '🏨 *Room Booking*\n\n1️⃣ Check availability\n2️⃣ Standard Room – ₹2,500/night\n3️⃣ Deluxe Room – ₹4,000/night\n4️⃣ Suite – ₹7,000/night\n\n0️⃣ Back to main menu',
        hinglish: '🏨 *Room Booking*\n\n1️⃣ Availability check karo\n2️⃣ Standard Room – ₹2,500/raat\n3️⃣ Deluxe Room – ₹4,000/raat\n4️⃣ Suite – ₹7,000/raat\n\n0️⃣ Wapas jao',
      },
      '2': {
        hindi:    '🏷️ *चेक-इन / चेक-आउट*\n\n1️⃣ चेक-इन समय\n2️⃣ चेक-आउट समय\n3️⃣ अर्ली चेक-इन\n4️⃣ लेट चेक-आउट\n\n0️⃣ वापस जाएं',
        english:  '🏷️ *Check-in / Check-out*\n\n1️⃣ Check-in timings\n2️⃣ Check-out timings\n3️⃣ Early check-in\n4️⃣ Late check-out\n\n0️⃣ Back',
        hinglish: '🏷️ *Check-in / Check-out*\n\n1️⃣ Check-in time\n2️⃣ Check-out time\n3️⃣ Early check-in\n4️⃣ Late check-out\n\n0️⃣ Wapas jao',
      },
      '3': {
        hindi:    '🍽️ *रूम सर्विस*\n\n1️⃣ मेनू देखें\n2️⃣ ऑर्डर करें\n3️⃣ सर्विस समय\n\n0️⃣ वापस जाएं',
        english:  '🍽️ *Room Service*\n\n1️⃣ View menu\n2️⃣ Place order\n3️⃣ Service hours\n\n0️⃣ Back',
        hinglish: '🍽️ *Room Service*\n\n1️⃣ Menu dekhna\n2️⃣ Order karna\n3️⃣ Service hours\n\n0️⃣ Wapas jao',
      },
      '4': {
        hindi:    '📍 *स्थान और संपर्क*\n\n1️⃣ होटल का पता\n2️⃣ फ़ोन नंबर\n3️⃣ ईमेल\n\n0️⃣ वापस जाएं',
        english:  '📍 *Location & Contact*\n\n1️⃣ Hotel address\n2️⃣ Phone number\n3️⃣ Email\n\n0️⃣ Back',
        hinglish: '📍 *Location aur Contact*\n\n1️⃣ Hotel ka address\n2️⃣ Phone number\n3️⃣ Email\n\n0️⃣ Wapas jao',
      },
    },
    replies: {
      '1_1': { hindi: 'कमरे की उपलब्धता के लिए रिसेप्शन को +91-XXXXX पर कॉल करें।', english: 'For room availability please call our reception at +91-XXXXX or visit our website.', hinglish: 'Room availability ke liye reception ko +91-XXXXX pe call karo.' },
      '1_2': { hindi: 'स्टैंडर्ड रूम: ₹2,500/रात। AC, TV, Wi-Fi शामिल। बुकिंग: +91-XXXXX', english: 'Standard Room: ₹2,500/night. Includes AC, TV & Wi-Fi. Book: +91-XXXXX', hinglish: 'Standard Room: ₹2,500/raat. AC, TV, Wi-Fi included. Book: +91-XXXXX' },
      '1_3': { hindi: 'डीलक्स रूम: ₹4,000/रात। किंग बेड, बाथटब। बुकिंग: +91-XXXXX', english: 'Deluxe Room: ₹4,000/night. King bed, bathtub, city view. Book: +91-XXXXX', hinglish: 'Deluxe Room: ₹4,000/raat. King bed, bathtub. Book: +91-XXXXX' },
      '1_4': { hindi: 'सुइट: ₹7,000/रात। लग्जरी अनुभव। बुकिंग: +91-XXXXX', english: 'Suite: ₹7,000/night. Luxury experience, living area included. Book: +91-XXXXX', hinglish: 'Suite: ₹7,000/raat. Luxury experience. Book: +91-XXXXX' },
      '2_1': { hindi: 'चेक-इन समय: दोपहर 2 बजे। ID प्रूफ साथ लाएं।', english: 'Check-in time: 2:00 PM. Please carry a valid photo ID.', hinglish: 'Check-in time: Dopahar 2 baje. Valid ID saath lao.' },
      '2_2': { hindi: 'चेक-आउट समय: सुबह 12 बजे। लेट चेक-आउट उपलब्ध है।', english: 'Check-out time: 12:00 PM. Late check-out available on request.', hinglish: 'Check-out time: Dopahar 12 baje. Late check-out available.' },
      '2_3': { hindi: 'अर्ली चेक-इन सुबह 10 बजे से। ₹500 अतिरिक्त शुल्क।', english: 'Early check-in available from 10 AM. ₹500 extra charge applies.', hinglish: 'Early check-in 10 baje se. ₹500 extra charge.' },
      '2_4': { hindi: 'लेट चेक-आउट शाम 4 बजे तक। ₹500 अतिरिक्त शुल्क।', english: 'Late check-out till 4 PM. ₹500 extra charge applies.', hinglish: 'Late check-out shaam 4 baje tak. ₹500 extra.' },
      '3_1': { hindi: 'रूम सर्विस मेनू: नाश्ता, लंच, डिनर और स्नैक्स।', english: 'Room service menu: Breakfast, Lunch, Dinner & Snacks available.', hinglish: 'Room service mein: Breakfast, Lunch, Dinner & Snacks.' },
      '3_2': { hindi: 'ऑर्डर के लिए रिसेप्शन कॉल करें या एक्सटेंशन 0 दबाएं।', english: 'To place an order call reception or dial extension 0 from your room.', hinglish: 'Order ke liye reception call karo ya extension 0 dial karo.' },
      '3_3': { hindi: 'रूम सर्विस 24/7 उपलब्ध है।', english: 'Room service is available 24 hours a day, 7 days a week.', hinglish: 'Room service 24/7 available hai.' },
      '4_1': { hindi: 'पता: 123, होटल रोड, नई दिल्ली – 110001', english: 'Address: 123, Hotel Road, New Delhi – 110001', hinglish: 'Address: 123, Hotel Road, New Delhi – 110001' },
      '4_2': { hindi: 'फ़ोन: +91-XXXXX | रिसेप्शन: एक्सटेंशन 0', english: 'Phone: +91-XXXXX | Reception: Extension 0', hinglish: 'Phone: +91-XXXXX | Reception: Extension 0' },
      '4_3': { hindi: 'ईमेल: info@hotel.com', english: 'Email: info@hotel.com', hinglish: 'Email: info@hotel.com' },
    },
  },

  restaurant: {
    main: {
      hindi:    '🍽️ नमस्ते! कैसे मदद करें?\n\n1️⃣ मेनू देखें\n2️⃣ टेबल बुकिंग\n3️⃣ होम डिलीवरी\n4️⃣ समय और स्थान\n\n0️⃣ भाषा बदलें',
      english:  '🍽️ How can we help you?\n\n1️⃣ View Menu\n2️⃣ Table Booking\n3️⃣ Home Delivery\n4️⃣ Timings & Location\n\n0️⃣ Change language',
      hinglish: '🍽️ Kaise help karein?\n\n1️⃣ Menu dekhna\n2️⃣ Table Book karna\n3️⃣ Home Delivery\n4️⃣ Timing aur Location\n\n0️⃣ Language change karo',
    },
    sub: {
      '1': {
        hindi:    '📋 *मेनू*\n\n1️⃣ स्टार्टर\n2️⃣ मेन कोर्स\n3️⃣ डेज़र्ट\n4️⃣ पेय पदार्थ\n\n0️⃣ वापस जाएं',
        english:  '📋 *Menu*\n\n1️⃣ Starters\n2️⃣ Main Course\n3️⃣ Desserts\n4️⃣ Beverages\n\n0️⃣ Back',
        hinglish: '📋 *Menu*\n\n1️⃣ Starters\n2️⃣ Main Course\n3️⃣ Desserts\n4️⃣ Drinks\n\n0️⃣ Wapas jao',
      },
      '2': {
        hindi:    '🪑 *टेबल बुकिंग*\n\n1️⃣ आज बुक करें\n2️⃣ कल बुक करें\n3️⃣ कस्टम तारीख\n4️⃣ पार्टी साइज़\n\n0️⃣ वापस जाएं',
        english:  '🪑 *Table Booking*\n\n1️⃣ Book for today\n2️⃣ Book for tomorrow\n3️⃣ Custom date\n4️⃣ Party size info\n\n0️⃣ Back',
        hinglish: '🪑 *Table Booking*\n\n1️⃣ Aaj book karo\n2️⃣ Kal book karo\n3️⃣ Custom date\n4️⃣ Kitne log?\n\n0️⃣ Wapas jao',
      },
      '3': {
        hindi:    '🛵 *होम डिलीवरी*\n\n1️⃣ ऑर्डर करें\n2️⃣ डिलीवरी समय\n3️⃣ डिलीवरी एरिया\n4️⃣ मिनिमम ऑर्डर\n\n0️⃣ वापस जाएं',
        english:  '🛵 *Home Delivery*\n\n1️⃣ Place order\n2️⃣ Delivery time\n3️⃣ Delivery area\n4️⃣ Minimum order\n\n0️⃣ Back',
        hinglish: '🛵 *Home Delivery*\n\n1️⃣ Order karo\n2️⃣ Delivery time\n3️⃣ Delivery area\n4️⃣ Minimum order\n\n0️⃣ Wapas jao',
      },
      '4': {
        hindi:    '📍 *समय और स्थान*\n\n1️⃣ खुलने का समय\n2️⃣ पता\n3️⃣ फ़ोन नंबर\n4️⃣ पार्किंग\n\n0️⃣ वापस जाएं',
        english:  '📍 *Timings & Location*\n\n1️⃣ Opening hours\n2️⃣ Address\n3️⃣ Phone number\n4️⃣ Parking\n\n0️⃣ Back',
        hinglish: '📍 *Timing aur Location*\n\n1️⃣ Opening hours\n2️⃣ Address\n3️⃣ Phone number\n4️⃣ Parking\n\n0️⃣ Wapas jao',
      },
    },
    replies: {
      '1_1': { hindi: 'स्टार्टर: सूप, सलाद, फ्राइड स्नैक्स। +91-XXXXX पर पूरा मेनू पाएं।', english: 'Starters: Soups, Salads & Fried Snacks. Call +91-XXXXX for full menu.', hinglish: 'Starters mein soups, salads & snacks. Full menu: +91-XXXXX' },
      '1_2': { hindi: 'मेन कोर्स: पंजाबी, साउथ इंडियन और चाइनीज़ डिशेज़।', english: 'Main course: Punjabi, South Indian & Chinese dishes available.', hinglish: 'Main course mein Punjabi, South Indian aur Chinese dishes.' },
      '1_3': { hindi: 'डेज़र्ट: गुलाब जामुन, आइसक्रीम, रसगुल्ला, पेस्ट्री।', english: 'Desserts: Gulab Jamun, Ice Cream, Rasgulla, Pastries.', hinglish: 'Desserts: Gulab Jamun, Ice Cream, Rasgulla, Pastries.' },
      '1_4': { hindi: 'पेय: जूस, कोल्ड ड्रिंक, चाय, कॉफ़ी।', english: 'Beverages: Juices, Cold Drinks, Tea, Coffee.', hinglish: 'Drinks: Juices, Cold Drinks, Chai, Coffee.' },
      '2_1': { hindi: 'आज टेबल बुकिंग: +91-XXXXX पर कॉल करें।', english: "For today's table booking call: +91-XXXXX", hinglish: 'Aaj ki booking ke liye: +91-XXXXX' },
      '2_2': { hindi: 'कल की बुकिंग: +91-XXXXX पर कॉल करें।', english: "For tomorrow's booking: +91-XXXXX", hinglish: 'Kal ki booking: +91-XXXXX' },
      '2_3': { hindi: 'कस्टम तारीख: +91-XXXXX पर संपर्क करें।', english: 'Custom date booking: +91-XXXXX', hinglish: 'Custom date ke liye: +91-XXXXX' },
      '2_4': { hindi: '2-8 लोगों की टेबल उपलब्ध। बड़े ग्रुप: पहले कॉल करें।', english: 'Tables for 2-8 people. Large groups: please call first.', hinglish: '2-8 logon ke liye table. Bade group: pehle call karo.' },
      '3_1': { hindi: 'होम डिलीवरी ऑर्डर: +91-XXXXX', english: 'Home delivery order: +91-XXXXX', hinglish: 'Home delivery: +91-XXXXX' },
      '3_2': { hindi: 'डिलीवरी समय: 30-45 मिनट।', english: 'Delivery time: 30-45 minutes.', hinglish: 'Delivery time: 30-45 minutes.' },
      '3_3': { hindi: '5 km के दायरे में डिलीवरी।', english: 'Delivery within 5 km radius.', hinglish: '5 km ke andar delivery.' },
      '3_4': { hindi: 'मिनिमम ऑर्डर: ₹200', english: 'Minimum order: ₹200', hinglish: 'Minimum order: ₹200' },
      '4_1': { hindi: 'समय: सुबह 10 से रात 11 बजे।', english: 'Hours: 10 AM – 11 PM, all days.', hinglish: 'Hours: 10 AM – 11 PM, har roz.' },
      '4_2': { hindi: 'पता: 456, फ़ूड स्ट्रीट, मुंबई', english: 'Address: 456, Food Street, Mumbai', hinglish: 'Address: 456, Food Street, Mumbai' },
      '4_3': { hindi: 'फ़ोन: +91-XXXXX', english: 'Phone: +91-XXXXX', hinglish: 'Phone: +91-XXXXX' },
      '4_4': { hindi: 'रेस्टोरेंट के सामने मुफ़्त पार्किंग।', english: 'Free parking in front of restaurant.', hinglish: 'Restaurant ke saamne free parking.' },
    },
  },

  salon: {
    main: {
      hindi:    '💇 नमस्ते! कैसे मदद करें?\n\n1️⃣ हमारी सेवाएं\n2️⃣ अपॉइंटमेंट बुक करें\n3️⃣ समय और लोकेशन\n4️⃣ ऑफर और पैकेज\n\n0️⃣ भाषा बदलें',
      english:  '💇 How can we help you?\n\n1️⃣ Our Services\n2️⃣ Book Appointment\n3️⃣ Timings & Location\n4️⃣ Offers & Packages\n\n0️⃣ Change language',
      hinglish: '💇 Kaise help karein?\n\n1️⃣ Hamari Services\n2️⃣ Appointment book karo\n3️⃣ Timing aur Location\n4️⃣ Offers aur Packages\n\n0️⃣ Language change karo',
    },
    sub: {
      '1': {
        hindi:    '✂️ *हमारी सेवाएं*\n\n1️⃣ हेयरकट\n2️⃣ कलर / हाइलाइट\n3️⃣ फेशियल / स्किनकेयर\n4️⃣ ब्राइडल मेकअप\n\n0️⃣ वापस जाएं',
        english:  '✂️ *Our Services*\n\n1️⃣ Haircut\n2️⃣ Color / Highlights\n3️⃣ Facial / Skincare\n4️⃣ Bridal Makeup\n\n0️⃣ Back',
        hinglish: '✂️ *Services*\n\n1️⃣ Haircut\n2️⃣ Color / Highlights\n3️⃣ Facial / Skincare\n4️⃣ Bridal Makeup\n\n0️⃣ Wapas jao',
      },
      '2': {
        hindi:    '📅 *अपॉइंटमेंट*\n\n1️⃣ आज के लिए\n2️⃣ कल के लिए\n3️⃣ इस हफ्ते\n4️⃣ कस्टम तारीख\n\n0️⃣ वापस जाएं',
        english:  '📅 *Book Appointment*\n\n1️⃣ For today\n2️⃣ For tomorrow\n3️⃣ This week\n4️⃣ Custom date\n\n0️⃣ Back',
        hinglish: '📅 *Appointment*\n\n1️⃣ Aaj ke liye\n2️⃣ Kal ke liye\n3️⃣ Is week\n4️⃣ Custom date\n\n0️⃣ Wapas jao',
      },
      '3': {
        hindi:    '📍 *समय और लोकेशन*\n\n1️⃣ खुलने का समय\n2️⃣ पता\n3️⃣ फ़ोन\n4️⃣ Google Maps\n\n0️⃣ वापस जाएं',
        english:  '📍 *Timings & Location*\n\n1️⃣ Opening hours\n2️⃣ Address\n3️⃣ Phone\n4️⃣ Google Maps link\n\n0️⃣ Back',
        hinglish: '📍 *Timing aur Location*\n\n1️⃣ Opening hours\n2️⃣ Address\n3️⃣ Phone\n4️⃣ Google Maps\n\n0️⃣ Wapas jao',
      },
      '4': {
        hindi:    '🎁 *ऑफर और पैकेज*\n\n1️⃣ वीकडे स्पेशल\n2️⃣ ब्राइडल पैकेज\n3️⃣ हेयर केयर पैकेज\n4️⃣ मेंबरशिप\n\n0️⃣ वापस जाएं',
        english:  '🎁 *Offers & Packages*\n\n1️⃣ Weekday special\n2️⃣ Bridal package\n3️⃣ Hair care package\n4️⃣ Membership\n\n0️⃣ Back',
        hinglish: '🎁 *Offers & Packages*\n\n1️⃣ Weekday special\n2️⃣ Bridal package\n3️⃣ Hair care package\n4️⃣ Membership\n\n0️⃣ Wapas jao',
      },
    },
    replies: {
      '1_1': { hindi: 'हेयरकट: पुरुष ₹200 से, महिला ₹400 से। अपॉइंटमेंट: +91-XXXXX', english: 'Haircut: Men from ₹200, Women from ₹400. Appointment: +91-XXXXX', hinglish: 'Haircut: Men ₹200 se, Women ₹400 se. Appointment: +91-XXXXX' },
      '1_2': { hindi: 'हेयर कलर: ₹800 से। हाइलाइट्स: ₹1,500 से।', english: 'Hair color from ₹800. Highlights from ₹1,500. Book: +91-XXXXX', hinglish: 'Hair color: ₹800 se. Highlights: ₹1,500 se.' },
      '1_3': { hindi: 'फेशियल: ₹600 से। स्किनकेयर: ₹1,000 से।', english: 'Facial from ₹600. Skincare treatment from ₹1,000.', hinglish: 'Facial: ₹600 se. Skincare: ₹1,000 se.' },
      '1_4': { hindi: 'ब्राइडल मेकअप: ₹8,000 से। 2 हफ्ते पहले बुक करें।', english: 'Bridal makeup from ₹8,000. Book 2 weeks in advance.', hinglish: 'Bridal makeup: ₹8,000 se. 2 weeks pehle book karo.' },
      '2_1': { hindi: 'आज के लिए: +91-XXXXX पर कॉल करें।', english: "For today's appointment call: +91-XXXXX", hinglish: 'Aaj ke liye: +91-XXXXX' },
      '2_2': { hindi: 'कल के लिए: +91-XXXXX', english: "For tomorrow: +91-XXXXX", hinglish: 'Kal ke liye: +91-XXXXX' },
      '2_3': { hindi: 'इस हफ्ते: +91-XXXXX | सोम-शनि उपलब्ध।', english: 'This week: +91-XXXXX | Mon-Sat available.', hinglish: 'Is week: +91-XXXXX | Mon-Sat.' },
      '2_4': { hindi: 'कस्टम तारीख: +91-XXXXX या WhatsApp करें।', english: 'Custom date: +91-XXXXX or WhatsApp us.', hinglish: 'Custom date: +91-XXXXX ya WhatsApp karo.' },
      '3_1': { hindi: 'समय: सुबह 9 से रात 9 बजे। सोम-रवि।', english: 'Hours: 9 AM – 9 PM, Monday to Sunday.', hinglish: 'Hours: 9 AM – 9 PM, Monday to Sunday.' },
      '3_2': { hindi: 'पता: 789, ब्यूटी लेन, दिल्ली', english: 'Address: 789, Beauty Lane, Delhi', hinglish: 'Address: 789, Beauty Lane, Delhi' },
      '3_3': { hindi: 'फ़ोन: +91-XXXXX', english: 'Phone: +91-XXXXX', hinglish: 'Phone: +91-XXXXX' },
      '3_4': { hindi: 'Google Maps: maps.google.com', english: 'Google Maps: maps.google.com/salon', hinglish: 'Google Maps: maps.google.com/salon' },
      '4_1': { hindi: 'वीकडे स्पेशल: सोम-शुक्र 20% छूट।', english: 'Weekday special: 20% off Mon-Fri.', hinglish: 'Weekday special: Mon-Fri 20% off.' },
      '4_2': { hindi: 'ब्राइडल पैकेज: ₹15,000 से।', english: 'Bridal package from ₹15,000. Includes makeup + hair.', hinglish: 'Bridal package: ₹15,000 se. Makeup + hair included.' },
      '4_3': { hindi: 'हेयर केयर: कट + कलर + ट्रीटमेंट ₹2,500।', english: 'Hair care package: Cut + Color + Treatment ₹2,500.', hinglish: 'Hair care: Cut + Color + Treatment ₹2,500.' },
      '4_4': { hindi: 'मेंबरशिप: ₹3,000/साल। सभी सेवाओं पर 15% छूट।', english: 'Membership: ₹3,000/year. 15% off all services.', hinglish: 'Membership: ₹3,000/year. 15% off all services.' },
    },
  },
};

// General/default content
DEFAULTS.general = {
  main: {
    hindi:    '😊 नमस्ते! कैसे मदद करें?\n\n1️⃣ हमारी सेवाएं\n2️⃣ मूल्य सूची\n3️⃣ संपर्क करें\n4️⃣ समय और स्थान\n\n0️⃣ भाषा बदलें',
    english:  '😊 How can we help?\n\n1️⃣ Our Services\n2️⃣ Pricing\n3️⃣ Contact Us\n4️⃣ Hours & Location\n\n0️⃣ Change language',
    hinglish: '😊 Kaise help karein?\n\n1️⃣ Hamari Services\n2️⃣ Pricing\n3️⃣ Contact karo\n4️⃣ Hours aur Location\n\n0️⃣ Language change karo',
  },
  sub: {
    '1': { hindi: '🔧 *हमारी सेवाएं*\n\n1️⃣ सेवा 1\n2️⃣ सेवा 2\n3️⃣ सेवा 3\n4️⃣ सेवा 4\n\n0️⃣ वापस', english: '🔧 *Our Services*\n\n1️⃣ Service 1\n2️⃣ Service 2\n3️⃣ Service 3\n4️⃣ Service 4\n\n0️⃣ Back', hinglish: '🔧 *Services*\n\n1️⃣ Service 1\n2️⃣ Service 2\n3️⃣ Service 3\n4️⃣ Service 4\n\n0️⃣ Wapas' },
    '2': { hindi: '💰 *मूल्य सूची*\n\n1️⃣ बेसिक\n2️⃣ स्टैंडर्ड\n3️⃣ प्रीमियम\n4️⃣ कस्टम\n\n0️⃣ वापस', english: '💰 *Pricing*\n\n1️⃣ Basic\n2️⃣ Standard\n3️⃣ Premium\n4️⃣ Custom\n\n0️⃣ Back', hinglish: '💰 *Pricing*\n\n1️⃣ Basic\n2️⃣ Standard\n3️⃣ Premium\n4️⃣ Custom\n\n0️⃣ Wapas' },
    '3': { hindi: '📞 *संपर्क*\n\n1️⃣ फ़ोन\n2️⃣ ईमेल\n3️⃣ WhatsApp\n4️⃣ वेबसाइट\n\n0️⃣ वापस', english: '📞 *Contact*\n\n1️⃣ Phone\n2️⃣ Email\n3️⃣ WhatsApp\n4️⃣ Website\n\n0️⃣ Back', hinglish: '📞 *Contact*\n\n1️⃣ Phone\n2️⃣ Email\n3️⃣ WhatsApp\n4️⃣ Website\n\n0️⃣ Wapas' },
    '4': { hindi: '⏰ *समय और स्थान*\n\n1️⃣ खुलने का समय\n2️⃣ पता\n3️⃣ Google Maps\n\n0️⃣ वापस', english: '⏰ *Hours & Location*\n\n1️⃣ Opening hours\n2️⃣ Address\n3️⃣ Google Maps\n\n0️⃣ Back', hinglish: '⏰ *Hours aur Location*\n\n1️⃣ Opening hours\n2️⃣ Address\n3️⃣ Google Maps\n\n0️⃣ Wapas' },
  },
  replies: {
    '1_1': { hindi: 'सेवा 1 की जानकारी। +91-XXXXX', english: 'Service 1 details. Contact: +91-XXXXX', hinglish: 'Service 1. Contact: +91-XXXXX' },
    '1_2': { hindi: 'सेवा 2 की जानकारी। +91-XXXXX', english: 'Service 2 details. Contact: +91-XXXXX', hinglish: 'Service 2. Contact: +91-XXXXX' },
    '1_3': { hindi: 'सेवा 3 की जानकारी। +91-XXXXX', english: 'Service 3 details. Contact: +91-XXXXX', hinglish: 'Service 3. Contact: +91-XXXXX' },
    '1_4': { hindi: 'सेवा 4 की जानकारी। +91-XXXXX', english: 'Service 4 details. Contact: +91-XXXXX', hinglish: 'Service 4. Contact: +91-XXXXX' },
    '2_1': { hindi: 'बेसिक: ₹999/माह।', english: 'Basic plan: ₹999/month.', hinglish: 'Basic plan: ₹999/month.' },
    '2_2': { hindi: 'स्टैंडर्ड: ₹1,999/माह।', english: 'Standard plan: ₹1,999/month.', hinglish: 'Standard: ₹1,999/month.' },
    '2_3': { hindi: 'प्रीमियम: ₹4,999/माह।', english: 'Premium plan: ₹4,999/month.', hinglish: 'Premium: ₹4,999/month.' },
    '2_4': { hindi: 'कस्टम प्लान: +91-XXXXX', english: 'Custom plan: +91-XXXXX', hinglish: 'Custom plan: +91-XXXXX' },
    '3_1': { hindi: 'फ़ोन: +91-XXXXX', english: 'Phone: +91-XXXXX', hinglish: 'Phone: +91-XXXXX' },
    '3_2': { hindi: 'ईमेल: info@business.com', english: 'Email: info@business.com', hinglish: 'Email: info@business.com' },
    '3_3': { hindi: 'WhatsApp: +91-XXXXX', english: 'WhatsApp: +91-XXXXX', hinglish: 'WhatsApp: +91-XXXXX' },
    '3_4': { hindi: 'वेबसाइट: www.business.com', english: 'Website: www.business.com', hinglish: 'Website: www.business.com' },
    '4_1': { hindi: 'समय: सोम-शनि, 9 AM – 6 PM', english: 'Hours: Mon-Sat, 9 AM – 6 PM', hinglish: 'Hours: Mon-Sat, 9 AM – 6 PM' },
    '4_2': { hindi: 'पता: आपका व्यापार पता', english: 'Address: Your business address', hinglish: 'Address: Your business address' },
    '4_3': { hindi: 'Google Maps: maps.google.com', english: 'Google Maps: maps.google.com', hinglish: 'Google Maps: maps.google.com' },
  },
};

// ── Content resolution (custom overrides defaults) ─────────────────────────

function resolveMain(smartMenu, bizType, lang) {
  return smartMenu?.main?.[lang]
    || (DEFAULTS[bizType] || DEFAULTS.general).main[lang]
    || (DEFAULTS[bizType] || DEFAULTS.general).main.english;
}

function resolveSub(smartMenu, bizType, option, lang) {
  return smartMenu?.sub?.[option]?.[lang]
    || (DEFAULTS[bizType] || DEFAULTS.general).sub?.[option]?.[lang]
    || (DEFAULTS[bizType] || DEFAULTS.general).sub?.[option]?.english;
}

function resolveReply(smartMenu, bizType, key, lang) {
  return smartMenu?.replies?.[key]?.[lang]
    || (DEFAULTS[bizType] || DEFAULTS.general).replies?.[key]?.[lang]
    || (DEFAULTS[bizType] || DEFAULTS.general).replies?.[key]?.english;
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function setContactState(contactId, updates) {
  await supabase.from('contacts').update(updates).eq('id', contactId);
}

async function sendAndRecord(workspace, contact, text) {
  if (!workspace.phone_number_id || !workspace.access_token || !text) return;
  await wa.sendText(workspace.phone_number_id, workspace.access_token, contact.phone, text);
  await supabase.from('messages').insert({
    workspace_id: workspace.id,
    contact_id:   contact.id,
    direction:    'outbound',
    type:         'text',
    body:         text,
    status:       'sent',
  });
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Returns true when the state machine handled the message (caller should skip
 * the regular keyword flow engine).
 */
async function handleConversation(contact, workspace, rawText) {
  const msg  = (rawText || '').trim().toLowerCase();
  if (!msg) return false;

  const sm      = workspace.smart_menu  || null;
  const bizType = workspace.business_type || 'general';
  const lang    = contact.preferred_language || 'english';
  const state   = contact.menu_state         || '';

  // ── Greeting → welcome screen ────────────────────────────────────────────
  if (GREETINGS.has(msg)) {
    const gr   = timeGreeting();
    const name = contact.name && contact.name !== contact.phone ? contact.name : 'Guest';
    const biz  = workspace.name || 'us';
    const text = `Good ${gr} ${name}! 👋\nWelcome to *${biz}*!\n\nPlease select your language:\n1️⃣ Hindi\n2️⃣ English\n3️⃣ Hinglish`;
    await setContactState(contact.id, { menu_state: 'language_select' });
    await sendAndRecord(workspace, contact, text);
    return true;
  }

  // ── Language selection (state: language_select) ──────────────────────────
  if (state === 'language_select' && LANG_MAP[msg]) {
    const chosenLang = LANG_MAP[msg];
    await setContactState(contact.id, { preferred_language: chosenLang, menu_state: 'main_menu' });
    const mainText = resolveMain(sm, bizType, chosenLang);
    if (mainText) {
      await sendAndRecord(workspace, { ...contact, preferred_language: chosenLang }, mainText);
      return true;
    }
    return false;
  }

  // ── Main menu → sub-menu (state: main_menu) ──────────────────────────────
  if (state === 'main_menu' && MAIN_OPTIONS.has(msg)) {
    const subText = resolveSub(sm, bizType, msg, lang);
    if (subText) {
      await setContactState(contact.id, { menu_state: `sub_menu_${msg}`, last_menu_reply: msg });
      await sendAndRecord(workspace, contact, subText);
      return true;
    }
    return false;
  }

  // ── Sub-menu: "0" → back to main menu ───────────────────────────────────
  if (state.startsWith('sub_menu_') && msg === '0') {
    await setContactState(contact.id, { menu_state: 'main_menu' });
    const mainText = resolveMain(sm, bizType, lang);
    if (mainText) { await sendAndRecord(workspace, contact, mainText); return true; }
    return false;
  }

  // ── Sub-menu: digit → final reply ───────────────────────────────────────
  if (state.startsWith('sub_menu_') && MAIN_OPTIONS.has(msg)) {
    const parentOpt = state.replace('sub_menu_', '');
    const replyKey  = `${parentOpt}_${msg}`;
    const replyText = resolveReply(sm, bizType, replyKey, lang);
    if (replyText) {
      // After final reply, return to main menu state so next message re-enters menu
      await setContactState(contact.id, { menu_state: 'main_menu', last_menu_reply: msg });
      await sendAndRecord(workspace, contact, replyText);
      return true;
    }
    return false;
  }

  // ── "menu" / "back" / "restart" → show main menu ─────────────────────────
  if (['menu', 'back', 'restart', 'main'].includes(msg) && state) {
    await setContactState(contact.id, { menu_state: 'main_menu' });
    const mainText = resolveMain(sm, bizType, lang);
    if (mainText) { await sendAndRecord(workspace, contact, mainText); return true; }
    return false;
  }

  return false;
}

// Expose defaults for the visual tree in the frontend
module.exports = { handleConversation, DEFAULTS };
