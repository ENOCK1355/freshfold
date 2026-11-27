export type ContentSection = {
  id: string;
  title: string;
  paragraphs: string[];
  points?: string[];
};

export type SiteArticle = {
  slug: string;
  title: string;
  eyebrow: string;
  intro: string;
  image: string;
  imageAlt: string;
  category: string;
  sections: ContentSection[];
};

export const siteArticles: Record<string, SiteArticle> = {
  about: {
    slug: "about",
    title: "A lighter load. A fuller life.",
    eyebrow: "OUR STORY",
    intro:
      "For the lectures, the late nights, the big plans, and everything in between. Fresh Fold makes room for the life you came here to live.",
    image: "/images/laundry-folding.webp",
    imageAlt: "Hands carefully folding freshly washed clothes",
    category: "Fresh Fold",
    sections: [
      {
        id: "our-start",
        title: "Life is full. Your laundry basket doesn’t have to be.",
        paragraphs: [
          "A busy week can fill up quickly. Between lectures, assignments, work, and time with friends, laundry becomes one more thing waiting for your attention. Fresh Fold was built around a simple idea: finding good local laundry care should fit into your day.",
          "We bring the practical details together: who serves your area, what they clean, how they price it, and when they can collect. You choose the company and the care. Your account keeps the booking, conversation, and updates together.",
        ],
      },
      {
        id: "close-to-campus",
        title: "Rooted in campus life in Cape Coast.",
        paragraphs: [
          "Our focus is the communities around the University of Cape Coast, including Amamoma, Kwaprow, Ayensu, Apewosika, UCC Science, and the Diaspora halls. Collection depends on the company, your address, and the windows available when you book.",
          "Fresh Fold is an independent marketplace. The laundry named on your order handles the cleaning, collection, and return of your items. We provide the platform and help you keep the process clear.",
        ],
      },
      {
        id: "our-approach",
        title: "Less guesswork, from basket to doorstep.",
        paragraphs: [
          "A useful service starts with clear expectations. That means showing pricing units, collection charges, minimum orders, and estimated turnaround before you commit. It also means giving you somewhere to ask a question when an item needs particular care.",
        ],
        points: [
          "Choose your laundry company, rather than leaving the decision to chance.",
          "Review your basket and its complete price before payment.",
          "Follow each order and keep your conversations in one place.",
          "Raise a concern from the order so support has the right context.",
        ],
      },
      {
        id: "local-businesses",
        title: "A better home for local laundry businesses.",
        paragraphs: [
          "For laundry owners, Fresh Fold brings services, bookings, team access, and earnings into one workspace. A clear profile helps students understand your business, while a shared order queue helps your team organise the work.",
          "We want everyday laundry care to feel straightforward on both sides: more visibility for local businesses, and more time back for the people they serve.",
        ],
      },
    ],
  },
  terms: {
    slug: "terms",
    title: "Clear terms. Better laundry days.",
    eyebrow: "TERMS OF SERVICE",
    category: "Our policies",
    intro:
      "How Fresh Fold works, what to expect when you book, and the responsibilities we share along the way.",
    image: "/images/folded-garments.webp",
    imageAlt: "A neatly arranged stack of folded garments",
    sections: [
      {
        id: "the-marketplace",
        title: "Using the marketplace",
        paragraphs: [
          "Fresh Fold connects customers with independent laundry companies. The company named on your booking fulfils the laundry service, including any collection and delivery it offers. Fresh Fold provides discovery, booking tools, payment records, order updates, and platform support.",
          "Review these terms, the selected company’s services, and the care and refund policies before placing an order. If you have a question about a particular garment or arrangement, ask before you book.",
        ],
      },
      {
        id: "your-account",
        title: "Your account and information",
        paragraphs: [
          "Keep your sign-in details private and use accurate contact and collection information. You are responsible for activity you authorise through your account. Tell support if you suspect someone else has gained access.",
          "Give the company useful care instructions and disclose delicate fabrics, known damage, colour-running risks, and specialist treatment requirements. A service is available only when it appears in the company’s catalogue or is agreed through the order conversation.",
        ],
      },
      {
        id: "booking-and-payment",
        title: "Booking, pricing, and payment",
        paragraphs: [
          "Your review screen shows the services, quantities, laundry charges, applicable collection fee, and platform convenience fee. Prices use the units shown beside each service. Weight-based orders remain estimates until the weight is confirmed; a higher charge requires your approval.",
          "An instant booking temporarily reserves a collection window during checkout. A company that reviews requests must accept before you are asked to pay. Your account shows the confirmed payment status.",
        ],
      },
      {
        id: "collection-and-care",
        title: "Collection, care, and delivery",
        paragraphs: [
          "Be available at the agreed location and collection window, with items ready and pockets emptied. Turnaround is the company’s stated service estimate. Check the order timeline and messages for changes or requests for information.",
          "Check your returned items and share a delivery confirmation code only after handover. Report a missing item, damage, or service concern from the relevant order with the details and evidence available to you.",
        ],
      },
      {
        id: "plans-and-listings",
        title: "Memberships and business listings",
        paragraphs: [
          "Student Plus is optional. Its benefits apply during the active paid period and do not change the company’s cleaning or delivery speed. Business hosting plans provide the features and limits shown at purchase. A hosting purchase does not replace application review or payment-account approval.",
          "Sponsored placements are identified. A business may lose access to new bookings when its plan expires or its listing is suspended; existing order records and support remain available.",
        ],
      },
      {
        id: "help-and-changes",
        title: "Cancellations, concerns, and changes",
        paragraphs: [
          "Cancellation and refund requests follow the refund policy and the progress of the order. Contact us through your order or WhatsApp if something needs attention. We review the agreed service, order history, and the information supplied by both parties.",
          "The version available when you use Fresh Fold explains the current service. Material changes will be reflected on this page. Contact Fresh Fold before booking if a condition is unclear.",
        ],
      },
    ],
  },
  privacy: {
    slug: "privacy",
    title: "Your information, handled with care.",
    eyebrow: "PRIVACY POLICY",
    category: "Our policies",
    intro:
      "A clear look at the information Fresh Fold uses to organise your laundry, keep your account secure, and help when you need us.",
    image: "/images/hanging-shirts.webp",
    imageAlt: "Fresh white shirts on a clothing rail",
    sections: [
      {
        id: "information",
        title: "The information we use",
        paragraphs: [
          "When you create an account or use Fresh Fold, we store the details needed to provide the service: your name, sign-in email, optional phone number, saved collection addresses, care preferences, bookings, messages, receipts, and support requests. Business accounts also provide profile and application information.",
          "We use session and security information to keep you signed in, protect forms, investigate errors, and limit misuse. Your temporary comparison selection is stored in your browser so you can compare laundries during your visit.",
        ],
      },
      {
        id: "purpose",
        title: "Why we use it",
        paragraphs: [
          "Account details let you sign in. Booking and address details help the selected company collect and return your laundry. Payment references and order records support receipts, refunds, and reconciliation. In-app messages and notifications keep the relevant service updates together.",
          "We also use service records to maintain the platform and understand operational issues. We do not sell your personal information.",
        ],
      },
      {
        id: "sharing",
        title: "Who can see your information",
        paragraphs: [
          "The laundry company you book can access the order information it needs to fulfil that booking. Staff access depends on the permissions assigned to their role. Platform support and authorised administrators use records needed for service operations and resolving issues.",
          "Payment processing and private file storage may use service providers. Access should be limited to the information needed for their role in the service.",
        ],
      },
      {
        id: "payments",
        title: "Payment details stay with the payment provider",
        paragraphs: [
          "Payment details are entered on Paystack’s hosted checkout. Fresh Fold stores payment references, amounts, and transaction status; it does not collect or store card numbers, CVVs, or mobile money PINs.",
          "Never send a payment PIN, one-time payment code, or full card information in a chat, contact form, or support request.",
        ],
      },
      {
        id: "control",
        title: "Your account and choices",
        paragraphs: [
          "You can update your profile, addresses, and saved preferences from your account. Account settings include a way to request a copy of your information or ask for account deletion. Support can help with a request or an incorrect record.",
          "Some records may need to remain available for outstanding orders, payment reconciliation, disputes, and applicable record-keeping obligations. A deletion request is reviewed in that context rather than silently removing transaction history.",
        ],
      },
      {
        id: "security-and-contact",
        title: "Keeping records secure and getting in touch",
        paragraphs: [
          "Fresh Fold uses password hashing, protected server sessions, role-based access, and checks on sensitive requests. Access to private company documents requires authorisation. No online service can promise that every security risk is eliminated.",
          "Contact Fresh Fold through the contact page, admin@freshfold.test, or WhatsApp on +233551234987 for a privacy question. Include enough context to identify the request, but avoid sending unnecessary sensitive documents through an open message.",
        ],
      },
    ],
  },
  "refund-policy": {
    slug: "refund-policy",
    title: "A clear way to put things right.",
    eyebrow: "CANCELLATIONS & REFUNDS",
    category: "Our policies",
    intro:
      "Plans change. When a booking or payment needs attention, here’s how to request a cancellation and follow a refund.",
    image: "/images/linen-shelves.webp",
    imageAlt: "Fresh linen organised on laundry shelves",
    sections: [
      {
        id: "before-collection",
        title: "Before your laundry is collected",
        paragraphs: [
          "You can cancel an unpaid booking before collection from the order. If you have already paid, use the order’s support option to ask for cancellation and a refund review. Let the company know promptly if your collection arrangements change.",
          "Once collection has happened or care has started, the work already performed and the booking terms affect what can be refunded. A request is reviewed using the order status and the information from you and the company.",
        ],
      },
      {
        id: "request",
        title: "How to request a refund",
        paragraphs: [
          "Open the relevant order in your account and create a support case. Explain what happened, identify the affected services or items, and include the information that will help the team review the request. Keeping the request attached to the order helps avoid missing payment or collection details.",
        ],
        points: [
          "Choose the order that the request relates to.",
          "Describe the issue and the outcome you are requesting.",
          "Keep the collection record, messages, and any useful photographs.",
          "Follow the case timeline for questions and the decision.",
        ],
      },
      {
        id: "amount",
        title: "Understanding the amount",
        paragraphs: [
          "An approved full refund reverses the refundable laundry charge and the standard convenience fee. A partial laundry refund applies to the approved portion of the laundry charge; the standard convenience fee remains. Any collection charge and work already performed are considered during the review.",
          "Payment-provider processing expenses are recorded separately from the service refund. Your receipt and refund record show the amount authorised for your transaction.",
        ],
      },
      {
        id: "status",
        title: "Pending and completed refunds",
        paragraphs: [
          "An approved or pending refund is still being processed. A completed status means the payment provider has reported the refund as processed; the time it takes to appear in your account depends on the payment method and provider.",
          "Follow the refund from your order and keep the reference. If the expected provider processing period has passed, reply in the existing support case so the team can investigate the same transaction.",
        ],
      },
      {
        id: "expired-checkout",
        title: "Expired bookings and late payments",
        paragraphs: [
          "Collection capacity is held for a limited time during checkout. If the reservation expires, choose another available window before making a new booking. Avoid paying a second time while an earlier payment is still pending.",
          "A successful payment received after its reservation has expired is routed for a full refund instead of silently confirming a window that is no longer reserved. Contact support if the payment and booking status appear inconsistent.",
        ],
      },
    ],
  },
  "care-policy": {
    slug: "care-policy",
    title: "Good care starts before collection.",
    eyebrow: "GARMENT CARE & CLAIMS",
    category: "Our policies",
    intro:
      "A little preparation, clear care notes, and a simple way to raise a concern help protect the things you wear every day.",
    image: "/images/steam-press.webp",
    imageAlt: "A modern iron pressing a white garment",
    sections: [
      {
        id: "prepare",
        title: "Prepare your basket",
        paragraphs: [
          "Empty every pocket, check garment labels, and separate items that need different treatment. Secure loose accessories and tell the company about stains, delicate trims, known damage, or colours that may run.",
          "Include specialist garments only if your chosen company explicitly offers the treatment they need. A standard wash-and-fold service is not a substitute for dry cleaning or other specialist care.",
        ],
        points: [
          "Check pockets, fasteners, and care labels.",
          "Count special items and make a note of their condition.",
          "Flag sensitive fabrics and treatment restrictions in the booking.",
          "Confirm unusual requests with the company before collection.",
        ],
      },
      {
        id: "instructions",
        title: "Make care instructions useful",
        paragraphs: [
          "Use the care-notes field for information specific to your basket, such as a low-temperature wash requirement or an item that should not be tumble dried. Saved preferences can help with repeat bookings, but check them each time your basket changes.",
          "Ask the company if you are unsure whether a service is suitable. Only the services agreed for your order should be performed; additional work or a higher price needs your approval.",
        ],
      },
      {
        id: "weight-and-handover",
        title: "Weight, counts, and handover",
        paragraphs: [
          "Weight-based prices begin as an estimate. The company records the confirmed weight after collection, and an increase requires your approval. Keep a note of separately priced items and anything you have asked to receive special attention.",
          "At delivery, check the items and their condition before sharing your confirmation code. Use the order conversation to report a discrepancy while the details are still easy to identify.",
        ],
      },
      {
        id: "report",
        title: "If an item needs attention",
        paragraphs: [
          "For a missing item, damage, delay, or incorrect treatment, open a support case from the relevant order. Identify the item, describe its condition before and after care, and explain which instruction or service the concern relates to.",
          "Keep available photographs, labels, collection records, and messages. The order and case timeline help the company and platform team review what was agreed and what happened.",
        ],
      },
      {
        id: "resolution",
        title: "Reviewing a claim",
        paragraphs: [
          "The team considers the selected service, instructions, condition information, order events, and responses from both parties. You may be asked for more detail before a decision is made. Any approved refund follows the refund policy and its recorded payment status.",
          "Fresh Fold does not promise insurance, automatic compensation, or a universal garment guarantee. A remedy depends on the service, the evidence, and the circumstances of the case. If you need clarification before sending a valuable or delicate item, ask first.",
        ],
      },
    ],
  },
  "help/booking": {
    slug: "help/booking",
    title: "Your first collection, made simple.",
    eyebrow: "BOOKING GUIDE",
    category: "Bookings",
    intro:
      "From choosing a laundry to getting your basket ready, here’s the whole process in one place.",
    image: "/images/laundry-basket.webp",
    imageAlt: "Clothes prepared in a laundry basket",
    sections: [
      {
        id: "choose",
        title: "Find the right care for your basket",
        paragraphs: [
          "Start with your area on Find laundry. Compare the companies that serve it, then open a profile to check the service list, pricing units, minimum order, collection options, and usual turnaround.",
          "Use comparison to place up to three companies side by side. A low starting price may use a different unit, so compare the services your basket actually needs.",
        ],
      },
      {
        id: "build",
        title: "Choose services and a collection window",
        paragraphs: [
          "Select your services and quantities. Choose collection or drop-off, then select an available window. Enter your hall, hostel, or address and a useful landmark so the company can find you.",
          "Add garment-specific care notes before reviewing the booking. Weight-based services are marked as estimates until the company confirms the weight.",
        ],
      },
      {
        id: "review",
        title: "Review the complete price",
        paragraphs: [
          "The review screen separates laundry charges, any collection fee, and the convenience fee. An active Student Plus membership waives the standard convenience fee on eligible orders.",
          "Instant bookings hold a window for 15 minutes while you complete payment. For a manual request, wait for the company to accept before checkout becomes available. A booking is paid only when its payment is confirmed.",
        ],
      },
      {
        id: "ready",
        title: "Be ready for collection",
        paragraphs: [
          "Empty pockets, check care labels, and have your items ready at the agreed place. Keep the order conversation available for a collection question. Follow the order timeline for acceptance, collection, care, and return updates.",
          "At delivery, check your basket before sharing the confirmation code. Once the order is completed, you can leave an order-linked review or raise a concern from the same order.",
        ],
      },
    ],
  },
  "help/payments": {
    slug: "help/payments",
    title: "Payments without the guesswork.",
    eyebrow: "PAYMENTS & RECEIPTS",
    category: "Payments",
    intro:
      "Understand your total, finish checkout, and find the right record if a payment or refund needs attention.",
    image: "/images/wardrobe.webp",
    imageAlt: "Everyday garments neatly arranged on a rail",
    sections: [
      {
        id: "total",
        title: "What is included in your total?",
        paragraphs: [
          "Your checkout shows the selected laundry services, quantities and pricing units, any collection fee, and the platform convenience fee. Student Plus waives the standard convenience fee while its benefits are active.",
          "Check estimated-weight items carefully. A later increase needs your approval; the company cannot silently charge a higher amount because the final weight changed.",
        ],
      },
      {
        id: "checkout",
        title: "Complete payment on the hosted checkout",
        paragraphs: [
          "Paystack handles the payment details on its hosted checkout. Choose one of the methods available for the transaction. Fresh Fold never asks for your card number or mobile money PIN in a message.",
          "After checkout, return to the order and wait for confirmation. A payment is successful only after its status has been verified with the provider.",
        ],
      },
      {
        id: "pending",
        title: "If payment stays pending",
        paragraphs: [
          "Use the payment-status option on the order. If your browser closed or the network dropped, return to the same order rather than immediately making another payment.",
          "If money appears to have been taken but the order is not confirmed, open an order support case with the reference and approximate time. Never include a PIN, full card number, or one-time payment code.",
        ],
      },
      {
        id: "receipts",
        title: "Find your receipt and follow a refund",
        paragraphs: [
          "Open Receipts in your account and choose the order to view its breakdown and payment history. You can print the receipt from the order view.",
          "Refunds appear with their own amount and status. A pending refund is still processing. For a question about a refund, reply in the support case linked to that order so the team can follow the same payment record.",
        ],
      },
    ],
  },
  "help/membership": {
    slug: "help/membership",
    title: "Make more of your laundry routine.",
    eyebrow: "STUDENT PLUS GUIDE",
    category: "Student Plus",
    intro:
      "What Plus includes, what stays free, and how to keep your membership working for your week.",
    image: "/images/campus-life.webp",
    imageAlt: "Students spending time together outdoors",
    sections: [
      {
        id: "included",
        title: "The essentials are already yours",
        paragraphs: [
          "A free account lets you discover and compare companies, book laundry, track orders, save receipts, and raise support cases. You do not need Student Plus to use the marketplace.",
          "Plus is an optional paid membership for a 30-day period. Its current price and benefits are shown before purchase, and your billing page shows when the active period ends.",
        ],
      },
      {
        id: "benefits",
        title: "Put the extras to work",
        paragraphs: [
          "During an active membership, the standard convenience fee is waived on eligible orders. Laundry charges and any company collection charge still apply.",
          "Save your care preferences and set a weekly or fortnightly routine. A recurring schedule helps you plan; each actual booking still needs an available window and your payment authorisation. Priority support relates to platform assistance, rather than faster washing or delivery.",
        ],
      },
      {
        id: "manage",
        title: "Manage the period and renewal",
        paragraphs: [
          "Open Membership & billing in your account to see your plan, paid period, and payment records. Check any renewal choice before authorising it. A manual renewal uses a fresh checkout; mobile money renewal always requires your authorisation.",
          "Cancelling a future renewal does not remove the benefits already paid for. Your account continues as a free account after the paid period ends.",
        ],
      },
      {
        id: "right-for-you",
        title: "Choose what fits your routine",
        paragraphs: [
          "Compare the membership price with how often you book and the benefits you will use. If you only need occasional laundry, a free account may suit your week.",
          "You can still choose among available laundry companies with either account. Membership does not reserve collection capacity or promise a faster turnaround.",
        ],
      },
    ],
  },
  "help/business": {
    slug: "help/business",
    title: "Give your laundry business a home.",
    eyebrow: "PARTNER GUIDE",
    category: "For businesses",
    intro:
      "A practical path from your first profile to a published service catalogue and an organised order queue.",
    image: "/images/washer-loading.webp",
    imageAlt: "Laundry being loaded into a commercial washer",
    sections: [
      {
        id: "profile",
        title: "Start with a clear profile",
        paragraphs: [
          "Create a business account and add your business name, description, location, opening hours, service areas, and contact details. Use photographs you have permission to publish and explain your care offering in your own words.",
          "Add services with clear pricing units, minimum quantities where relevant, and realistic turnaround. State whether you collect, accept drop-off, or offer both, and include any collection charge.",
        ],
      },
      {
        id: "review",
        title: "Complete the application",
        paragraphs: [
          "Submit the requested business information and verification material from your workspace. The platform team reviews the application and can request corrections. A hosting purchase does not replace that review.",
          "Payment-account approval is a separate step. Your settlement setup must be ready for payment collection; a reviewed listing does not by itself establish payment-provider approval.",
        ],
      },
      {
        id: "publish",
        title: "Choose a plan and prepare for orders",
        paragraphs: [
          "Choose a hosting plan with the branch and staff capacity your business needs. Check your services, coverage, opening hours, collection windows, and daily capacity before publishing.",
          "Give each team member the permissions their work requires. A shared order queue helps staff follow acceptance, collection, cleaning, return, and customer conversations.",
        ],
      },
      {
        id: "operate",
        title: "Keep the service dependable",
        paragraphs: [
          "Update closures and availability when your team cannot accept more work. Respond to care questions, request approval before price changes, and keep order statuses accurate.",
          "Use earnings and settlement records to understand your transactions. If hosting expires, new bookings stop while you retain access to existing orders and support. Renew and check the profile before accepting new work again.",
        ],
      },
    ],
  },
  "help/care": {
    slug: "help/care",
    title: "A little prep. A fresher finish.",
    eyebrow: "GARMENT CARE GUIDE",
    category: "Care & delivery",
    intro:
      "Help your chosen laundry understand your basket before the first wash.",
    image: "/images/ironing-care.webp",
    imageAlt: "Fresh shirts and an iron ready for garment care",
    sections: [
      {
        id: "labels",
        title: "Start with the labels",
        paragraphs: [
          "Check the care label on each item and separate anything that needs a different temperature, drying method, or specialist treatment. Empty pockets and check for loose fasteners or accessories.",
          "Do not include a specialist item in a standard wash service unless the company has agreed to the appropriate treatment. When in doubt, ask through the company or order conversation first.",
        ],
      },
      {
        id: "notes",
        title: "Give useful care notes",
        paragraphs: [
          "Mention a known stain, a colour that may run, a delicate trim, or an existing tear. Clear instructions help the company decide whether it can offer the care your garment needs.",
          "If you use saved preferences, review them for each basket. A preference for one load may be unsuitable for a different fabric.",
        ],
      },
      {
        id: "return",
        title: "Check the return",
        paragraphs: [
          "Check separately priced items and anything sent for special treatment. Share the delivery confirmation code after the basket is handed over.",
          "For a missing or damaged item, use the support option on that order. Identify the item and keep any useful photos, labels, and messages so the review can focus on the right details.",
        ],
      },
    ],
  },
  "help/collections": {
    slug: "help/collections",
    title: "From your doorstep, back to your day.",
    eyebrow: "COLLECTION & DELIVERY",
    category: "Care & delivery",
    intro:
      "Addresses, collection windows, and handover details that help your laundry day run smoothly.",
    image: "/images/laundry-ready.webp",
    imageAlt: "A worker carrying a bag of linens in a laundry facility",
    sections: [
      {
        id: "address",
        title: "Make your address easy to find",
        paragraphs: [
          "Select the correct area, then add your hall or hostel, room or entrance details, and a useful landmark. A saved address is a starting point; check it before every booking if you have moved.",
          "The company’s coverage and your selected collection window determine availability. Seeing an area listed does not guarantee that every company can collect from every address.",
        ],
      },
      {
        id: "window",
        title: "Plan around the collection window",
        paragraphs: [
          "Be ready at the agreed place with items prepared. If your plans change, contact the company through the order as early as possible. Check the order messages if the team needs directions or additional information.",
          "For drop-off orders, follow the location and opening information in the company profile. Do not leave a basket unattended without an agreed handover.",
        ],
      },
      {
        id: "delivery",
        title: "Finish with a clear handover",
        paragraphs: [
          "The company updates the order as your clothes move through care and return. Its stated turnaround is the service estimate; the order conversation is the right place to clarify a delay.",
          "Check your returned items before sharing the delivery confirmation code. Confirm receipt from your account, then use the order’s support option if anything needs attention.",
        ],
      },
    ],
  },
  "help/account": {
    slug: "help/account",
    title: "Your laundry life, in one place.",
    eyebrow: "ACCOUNT & SECURITY",
    category: "Your account",
    intro:
      "Set up your account, keep the useful details close, and protect your sign-in.",
    image: "/images/laundry-sorting.webp",
    imageAlt: "A garment being inspected before washing",
    sections: [
      {
        id: "start",
        title: "Set up your account",
        paragraphs: [
          "Register with your name, email, and a unique passphrase of at least 12 characters. Your account is ready immediately after registration; email verification is not required.",
          "You can browse companies without an account. Sign in when you want to book, save a laundry, or manage your orders.",
        ],
      },
      {
        id: "organise",
        title: "Keep your useful details together",
        paragraphs: [
          "Save collection addresses with a label that makes sense to you, such as your hall or hostel. Saved laundries help you return to a company you want to book again.",
          "Your account groups orders, receipts, messages, notifications, and support. Student Plus members can also save care preferences and organise recurring schedules.",
        ],
      },
      {
        id: "protect",
        title: "Protect and recover your account",
        paragraphs: [
          "Use a password you do not use elsewhere and sign out on shared devices. Fresh Fold will not ask you to send your password or payment PIN in a message.",
          "If you need help signing in, contact support through WhatsApp or the contact page. While signed in, you can manage your password from account settings. Account settings also include information-export and deletion requests.",
        ],
      },
    ],
  },
  "help/tracking": {
    slug: "help/tracking",
    title: "Know where your laundry stands.",
    eyebrow: "ORDERS & SUPPORT",
    category: "Bookings",
    intro:
      "Follow each stage, ask the right person, and keep a concern connected to its order.",
    image: "/images/fresh-linen.webp",
    imageAlt: "A neatly made bed with fresh white linen",
    sections: [
      {
        id: "timeline",
        title: "Read your order timeline",
        paragraphs: [
          "Open My orders and choose a booking to see its current status and recorded history. The timeline follows acceptance, payment, collection, care, and delivery as the company updates the order.",
          "Check messages alongside the timeline. A company may need a care decision or collection detail before it can move to the next stage.",
        ],
      },
      {
        id: "conversation",
        title: "Keep the conversation with the order",
        paragraphs: [
          "Use the order conversation for collection directions, garment instructions, or a turnaround question. This keeps the detail visible to the team working on that basket.",
          "If a price change is needed, review it before approval. A message about a higher weight is not permission to silently increase your charge.",
        ],
      },
      {
        id: "support",
        title: "Raise a concern with the right context",
        paragraphs: [
          "Choose the support option on the order for a missing item, damage, incorrect charge, or payment issue. Describe what happened and the outcome you are asking for, then follow the case timeline for the response.",
          "For a general question before you book, use the contact page or WhatsApp. Avoid creating several cases for the same issue, as one clear thread makes it easier to follow the review.",
        ],
      },
    ],
  },
};

export const articleBody = (article: SiteArticle) =>
  [
    article.intro,
    ...article.sections.flatMap((section) => [
      `## ${section.title}`,
      ...section.paragraphs,
      ...(section.points
        ? [section.points.map((point) => `- ${point}`).join("\n")]
        : []),
    ]),
  ].join("\n\n");

export const legacyPublicContent = (body: string) =>
  /DRAFT FOR OWNER REVIEW|demonstration|fictional|simulator|\bdemo\b/i.test(
    body,
  );

export const retireCheckoutInstructions = (body: string) =>
  body.replaceAll(
    "A payment is confirmed after the server receives a successful provider response; a checkout redirect alone is not confirmation.",
    "Your account shows the confirmed payment status.",
  );

export const retireEmailInstructions = (body: string) =>
  body
    .replaceAll(
      "Open the verification link sent to your email before placing a booking.",
      "Your account is ready immediately after registration; email verification is not required.",
    )
    .replaceAll(
      "If you forget your password, use the recovery link on the sign-in page. A reset link is sent when an active account matches the email.",
      "If you need help signing in, contact support through WhatsApp or the contact page. While signed in, you can manage your password from account settings.",
    )
    .replaceAll(
      "Account details let you sign in and receive account communications.",
      "Account details let you sign in. Updates are available in your in-app messages and notifications.",
    )
    .replaceAll(
      "Payment processing, transactional communication, and private file storage",
      "Payment processing and private file storage",
    );
