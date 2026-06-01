export type BusinessType =
  | 'restaurant' | 'hotel' | 'real_estate' | 'salon'
  | 'clinic' | 'retail' | 'education' | 'automobile' | 'other';

export interface NavItem {
  href: string;
  label: string;
  emoji: string;
}

export interface FlowTemplate {
  name: string;
  trigger: { type: string; keyword?: string };
  steps: Array<{ type: string; config: Record<string, string> }>;
}

export interface BusinessConfig {
  type: BusinessType;
  label: string;
  emoji: string;
  subtitle: string;
  color: string; // Tailwind bg class for card accent
  nav: NavItem[];
  flowTemplates: FlowTemplate[];
  dashboardLabel: string;
}

export const BUSINESS_TYPES: BusinessConfig[] = [
  {
    type: 'restaurant',
    label: 'Restaurant',
    emoji: '🍽️',
    subtitle: 'Tables, Orders, Menu',
    color: 'bg-orange-500/20',
    dashboardLabel: 'Restaurant Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/tables-qr', label: 'Tables & QR', emoji: '🪑' },
      { href: '/orders', label: 'Orders', emoji: '📋' },
      { href: '/menu', label: 'Menu Manager', emoji: '🍽️' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '🍽️ Welcome + Menu',
        trigger: { type: 'keyword', keyword: 'hi, hello, menu, namaste, start' },
        steps: [{ type: 'send_message', config: { message: 'Namaste! 🙏 Hamare restaurant mein aapka swagat hai!\n\nHamari services:\n📋 MENU type karein - menu dekhne ke liye\n🪑 ORDER type karein - order karne ke liye\n🕙 TIMING type karein - timings ke liye\n\nKisi bhi help ke liye hum yahan hain! 😊' } }],
      },
      {
        name: '📋 Table Order',
        trigger: { type: 'keyword', keyword: 'order, chahiye, khana, food' },
        steps: [{ type: 'send_message', config: { message: 'Bilkul! 😊 Aapka order lena humari khushi hai.\n\nKripya apna table number aur order batayein:\nExample: "Table 5 - 2 Butter Naan, 1 Dal Makhani"\n\nHum jald hi aapka order process karenge! 🍛' } }],
      },
      {
        name: '🕙 Timings',
        trigger: { type: 'keyword', keyword: 'timing, time, open, band, kab' },
        steps: [{ type: 'send_message', config: { message: 'Hamare timings:\n🕙 Subah 10 baje - Raat 10 baje\n📅 Roz khule hain (Sunday bhi!)\n\nReservation ke liye: 📞 [apna number]' } }],
      },
    ],
  },
  {
    type: 'hotel',
    label: 'Hotel',
    emoji: '🏨',
    subtitle: 'Rooms, Bookings, Service',
    color: 'bg-blue-500/20',
    dashboardLabel: 'Hotel Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/tables-qr', label: 'Rooms & QR', emoji: '🏨' },
      { href: '/bookings', label: 'Bookings', emoji: '📅' },
      { href: '/room-service', label: 'Room Service', emoji: '🛎️' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '🏨 Welcome + Room Info',
        trigger: { type: 'keyword', keyword: 'hi, hello, room, booking, namaste' },
        steps: [{ type: 'send_message', config: { message: 'Namaste! 🙏 Hamare hotel mein aapka swagat hai!\n\nHamari services:\n🛏️ ROOMS type karein - available rooms dekhne ke liye\n📅 BOOK type karein - booking karne ke liye\n🛎️ SERVICE type karein - room service ke liye\n\nHum 24/7 aapki seva mein hain! 😊' } }],
      },
      {
        name: '🛎️ Room Service',
        trigger: { type: 'keyword', keyword: 'service, khana, room service, food' },
        steps: [{ type: 'send_message', config: { message: 'Room service ke liye dhanyavaad! 😊\n\nKripya batayein:\n- Aapka room number\n- Kya chahiye\n\nHum 20 minutes mein deliver karenge! 🚀' } }],
      },
      {
        name: '📅 Check-in / Check-out',
        trigger: { type: 'keyword', keyword: 'check in, checkout, check-out, arrive, timing' },
        steps: [{ type: 'send_message', config: { message: 'Check-in / Check-out info:\n⏰ Check-in: Dopahar 12 baje se\n⏰ Check-out: Subah 11 baje tak\n\nEarly check-in ya late checkout ke liye:\nHumse WhatsApp karein! 📱' } }],
      },
    ],
  },
  {
    type: 'real_estate',
    label: 'Real Estate',
    emoji: '🏠',
    subtitle: 'Properties, Leads, Visits',
    color: 'bg-green-500/20',
    dashboardLabel: 'Real Estate Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/properties', label: 'Properties', emoji: '🏠' },
      { href: '/site-visits', label: 'Site Visits', emoji: '📅' },
      { href: '/leads', label: 'Leads', emoji: '🎯' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '🏠 Property Inquiry',
        trigger: { type: 'keyword', keyword: 'property, flat, ghar, plot, house, bhukhandar' },
        steps: [{ type: 'send_message', config: { message: 'Namaste! 🙏 Property inquiry ke liye shukriya!\n\nHamari properties:\n🏢 Flats available hain\n🏠 Independent houses\n📦 Commercial spaces\n\nSite visit book karne ke liye: VISIT type karein\nPrice jaanne ke liye: PRICE type karein' } }],
      },
      {
        name: '📅 Site Visit Booking',
        trigger: { type: 'keyword', keyword: 'visit, dekhna, site visit, aana' },
        steps: [{ type: 'send_message', config: { message: 'Site visit ke liye shukriya! 😊\n\nKripya yeh details share karein:\n👤 Aapka naam\n📱 Contact number\n📅 Preferred date & time\n\nHamara team aapko confirm karega! ✅' } }],
      },
      {
        name: '💰 Price Inquiry',
        trigger: { type: 'keyword', keyword: 'price, rate, kitna, cost, budget' },
        steps: [{ type: 'send_message', config: { message: 'Hamare properties ki pricing:\n\n🏠 1BHK: ₹25L - ₹40L\n🏠 2BHK: ₹40L - ₹65L\n🏠 3BHK: ₹65L - ₹1.2Cr\n\nExact pricing ke liye:\nHumse directly baat karein! 📞' } }],
      },
    ],
  },
  {
    type: 'salon',
    label: 'Salon & Spa',
    emoji: '💇',
    subtitle: 'Appointments, Staff, Services',
    color: 'bg-pink-500/20',
    dashboardLabel: 'Salon Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/appointments', label: 'Appointments', emoji: '📅' },
      { href: '/services', label: 'Services', emoji: '💇' },
      { href: '/staff', label: 'Staff', emoji: '👨‍💼' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '📅 Appointment Booking',
        trigger: { type: 'keyword', keyword: 'appointment, book, booking, slot, date' },
        steps: [{ type: 'send_message', config: { message: 'Appointment book karne ke liye shukriya! 💇\n\nKripya batayein:\n👤 Aapka naam\n📅 Preferred date & time\n✂️ Kaunsi service chahiye\n\nHum slot confirm karenge! ✅' } }],
      },
      {
        name: '💅 Services & Prices',
        trigger: { type: 'keyword', keyword: 'service, price, rate, kitna, cost, haircut' },
        steps: [{ type: 'send_message', config: { message: 'Hamare services & prices:\n\n✂️ Haircut: ₹200-500\n💅 Manicure: ₹300-600\n💆 Facial: ₹500-1500\n🧖 Full body massage: ₹1000-2500\n\nAppointment ke liye: BOOK type karein 📅' } }],
      },
      {
        name: '🕙 Timings',
        trigger: { type: 'keyword', keyword: 'timing, open, kab, time, band' },
        steps: [{ type: 'send_message', config: { message: 'Hamare timings:\n🕙 Subah 9 baje - Raat 8 baje\n📅 Monday - Saturday\n❌ Sunday: Closed\n\nAppointment ke liye: BOOK type karein 💇' } }],
      },
    ],
  },
  {
    type: 'clinic',
    label: 'Clinic',
    emoji: '🏥',
    subtitle: 'Appointments, Patients, Reminders',
    color: 'bg-red-500/20',
    dashboardLabel: 'Clinic Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/appointments', label: 'Appointments', emoji: '📅' },
      { href: '/patients', label: 'Patients', emoji: '🏥' },
      { href: '/services', label: 'Services', emoji: '💊' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '📅 Appointment Booking',
        trigger: { type: 'keyword', keyword: 'appointment, doctor, milna, book, slot' },
        steps: [{ type: 'send_message', config: { message: 'Appointment ke liye shukriya! 🏥\n\nKripya yeh details share karein:\n👤 Patient ka naam\n📅 Preferred date & time\n🩺 Doctor ka naam (agar pata hai)\n💊 Takleef kya hai\n\nHum appointment confirm karenge! ✅' } }],
      },
      {
        name: '💊 Services & Fees',
        trigger: { type: 'keyword', keyword: 'service, fees, kitna, cost, treatment' },
        steps: [{ type: 'send_message', config: { message: 'Hamare services:\n\n👨‍⚕️ OPD Consultation: ₹300-500\n🩺 Specialist: ₹500-1000\n🔬 Lab Tests: Available\n\nEmergency ke liye hamesha available hain! 🚨' } }],
      },
      {
        name: '🕙 Timings',
        trigger: { type: 'keyword', keyword: 'timing, open, time, kab, schedule' },
        steps: [{ type: 'send_message', config: { message: 'Clinic timings:\n🕙 Morning: 9 AM - 1 PM\n🕔 Evening: 4 PM - 8 PM\n\n🚨 Emergency: 24/7 available\n📞 Emergency: [number]' } }],
      },
    ],
  },
  {
    type: 'retail',
    label: 'Retail Shop',
    emoji: '🛍️',
    subtitle: 'Orders, Inventory, Customers',
    color: 'bg-yellow-500/20',
    dashboardLabel: 'Shop Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/orders', label: 'Orders', emoji: '🛒' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '🛍️ Product Inquiry',
        trigger: { type: 'keyword', keyword: 'product, item, chahiye, buy, kharidna' },
        steps: [{ type: 'send_message', config: { message: 'Namaste! 🙏 Shopping ke liye shukriya!\n\nHamari categories:\n📦 Latest products dekhne ke liye: CATALOG type karein\n💰 Price jaanne ke liye: product name likhein\n🚚 Delivery: 2-3 working days\n\nKya dhundh rahe hain? 😊' } }],
      },
      {
        name: '📦 Order Karo',
        trigger: { type: 'keyword', keyword: 'order, order karna, place order' },
        steps: [{ type: 'send_message', config: { message: 'Order ke liye shukriya! 🛒\n\nKripya batayein:\n📦 Product name & quantity\n📍 Delivery address\n💳 Payment: UPI / Cash on delivery\n\nHum order confirm karenge! ✅' } }],
      },
      {
        name: '🕙 Shop Timings',
        trigger: { type: 'keyword', keyword: 'timing, open, time, kab, band' },
        steps: [{ type: 'send_message', config: { message: 'Hamare shop timings:\n🕙 Subah 10 baje - Raat 9 baje\n📅 Roz khule hain\n\nOnline order 24/7 available hai! 🚀' } }],
      },
    ],
  },
  {
    type: 'education',
    label: 'Education',
    emoji: '🎓',
    subtitle: 'Classes, Students, Fees',
    color: 'bg-indigo-500/20',
    dashboardLabel: 'Institute Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/classes', label: 'Classes', emoji: '📚' },
      { href: '/students', label: 'Students', emoji: '🎓' },
      { href: '/fees', label: 'Fees', emoji: '💰' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '📚 Admission Inquiry',
        trigger: { type: 'keyword', keyword: 'admission, class, join, enroll, course' },
        steps: [{ type: 'send_message', config: { message: 'Namaste! 🙏 Admission inquiry ke liye shukriya!\n\nHamari classes:\n📚 Courses dekhne ke liye: COURSES type karein\n💰 Fees jaanne ke liye: FEES type karein\n📅 Demo class ke liye: DEMO type karein\n\nKaunsa course mein interest hai? 🎓' } }],
      },
      {
        name: '💰 Fees Info',
        trigger: { type: 'keyword', keyword: 'fees, kitna, cost, price, charge' },
        steps: [{ type: 'send_message', config: { message: 'Hamare courses ki fees:\n\n📚 Foundation: ₹2000/month\n🎯 Advanced: ₹3500/month\n👑 Premium: ₹5000/month\n\nEMI options bhi available hain!\nAdhik jankari ke liye call karein 📞' } }],
      },
      {
        name: '📅 Schedule & Timings',
        trigger: { type: 'keyword', keyword: 'schedule, timing, batch, time, class time' },
        steps: [{ type: 'send_message', config: { message: 'Class schedule:\n\n🕙 Morning batch: 7 AM - 9 AM\n🕒 Afternoon batch: 2 PM - 4 PM\n🕖 Evening batch: 6 PM - 8 PM\n\nOnline classes bhi available hain! 💻' } }],
      },
    ],
  },
  {
    type: 'automobile',
    label: 'Automobile',
    emoji: '🚗',
    subtitle: 'Inquiries, Test Drives, Service',
    color: 'bg-slate-500/20',
    dashboardLabel: 'Dealership Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/vehicles', label: 'Vehicles', emoji: '🚗' },
      { href: '/test-drives', label: 'Test Drives', emoji: '🏎️' },
      { href: '/service-booking', label: 'Service', emoji: '🔧' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '🚗 Vehicle Inquiry',
        trigger: { type: 'keyword', keyword: 'car, bike, vehicle, inquiry, gaadi' },
        steps: [{ type: 'send_message', config: { message: 'Namaste! 🙏 Vehicle inquiry ke liye shukriya!\n\nHamari services:\n🚗 CAR type karein - cars dekhne ke liye\n🏍️ BIKE type karein - bikes dekhne ke liye\n🏎️ TEST type karein - test drive book karne ke liye\n\nKaunsi gaadi mein interest hai? 😊' } }],
      },
      {
        name: '🏎️ Test Drive',
        trigger: { type: 'keyword', keyword: 'test drive, try, chalana, demo' },
        steps: [{ type: 'send_message', config: { message: 'Test drive ke liye shukriya! 🏎️\n\nKripya batayein:\n👤 Aapka naam\n📱 Contact number\n🚗 Kaunsi car/bike\n📅 Preferred date & time\n\nHum slot confirm karenge! ✅' } }],
      },
      {
        name: '🔧 Service Booking',
        trigger: { type: 'keyword', keyword: 'service, repair, fixing, servicing, maintenance' },
        steps: [{ type: 'send_message', config: { message: 'Vehicle service ke liye shukriya! 🔧\n\nKripya batayein:\n🚗 Vehicle make & model\n📅 Preferred date\n🔧 Service type (routine/repair)\n📍 Pickup chahiye?\n\nHum pickup bhi arrange kar sakte hain! 🚚' } }],
      },
    ],
  },
  {
    type: 'other',
    label: 'Other Business',
    emoji: '📦',
    subtitle: 'Custom Setup',
    color: 'bg-purple-500/20',
    dashboardLabel: 'Business Overview',
    nav: [
      { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
      { href: '/contacts', label: 'Contacts', emoji: '👥' },
      { href: '/flows', label: 'Flows', emoji: '🤖' },
      { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
      { href: '/inbox', label: 'Inbox', emoji: '📥' },
      { href: '/settings', label: 'Settings', emoji: '⚙️' },
    ],
    flowTemplates: [
      {
        name: '👋 Welcome',
        trigger: { type: 'keyword', keyword: 'hi, hello, namaste, start, hey' },
        steps: [{ type: 'send_message', config: { message: 'Namaste! 🙏 Hamare business mein aapka swagat hai!\n\nHum aapki kaise madad kar sakte hain?\nApna sawaal likhein aur hum turant jawab denge! 😊' } }],
      },
      {
        name: '🕙 Timings',
        trigger: { type: 'keyword', keyword: 'timing, open, kab, time, band' },
        steps: [{ type: 'send_message', config: { message: 'Hamare timings:\n🕙 Subah 10 baje - Shaam 7 baje\n📅 Monday - Saturday\n\nKisi bhi help ke liye WhatsApp karein! 📱' } }],
      },
    ],
  },
];

export function getBusinessConfig(type?: string | null): BusinessConfig {
  return BUSINESS_TYPES.find((b) => b.type === type) ?? BUSINESS_TYPES[BUSINESS_TYPES.length - 1];
}

export const DEFAULT_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', emoji: '📊' },
  { href: '/contacts', label: 'Contacts', emoji: '👥' },
  { href: '/flows', label: 'Flows', emoji: '🤖' },
  { href: '/broadcasts', label: 'Broadcasts', emoji: '📢' },
  { href: '/inbox', label: 'Inbox', emoji: '📥' },
  { href: '/settings', label: 'Settings', emoji: '⚙️' },
];


// Returns true for restaurant/cafe/food business types
export function isRestaurantWorkspace(businessType?: string | null): boolean {
  return ['restaurant', 'cafe', 'food', 'dhaba', 'bakery'].includes(
    (businessType ?? '').toLowerCase()
  );
}
