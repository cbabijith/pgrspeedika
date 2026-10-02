/**
 * Realistic seed catalog for a Kerala vegetable + grocery shop.
 * Prices are per-kilogram in integer paise for loose goods.
 */

export type SeedCategory = {
  slug: string;
  nameEn: string;
  nameMl: string;
  description: string;
  emoji: string;
  sortOrder: number;
};

export type SeedLooseProduct = {
  slug: string;
  nameEn: string;
  nameMl: string;
  cat: string;
  emoji: string;
  perKgPaise: number;
  hsn: string;
  /** Ordered variant sizes in grams. Default [250, 500, 1000, 2000]. */
  steps?: number[];
  /** Step for custom quantities. Default 250. */
  step?: number;
  freshToday?: boolean;
  description?: string;
  keywords?: string;
  /** Grams on hand. Default 25000. */
  stockGrams?: number;
  lowStockGrams?: number;
};

export type SeedPackedProduct = {
  slug: string;
  nameEn: string;
  nameMl: string;
  cat: string;
  emoji: string;
  hsn: string;
  gstRate: number;
  brand?: string;
  description?: string;
  keywords?: string;
  variants: Array<{
    labelEn: string;
    labelMl: string;
    /** grams for weight-type variants, piece count for unit-type variants */
    quantity: number;
    unitType: "weight" | "unit";
    pricePaise: number;
    mrpPaise?: number;
  }>;
  /** Units on hand per variant. Default 40. */
  stockUnits?: number;
  lowStockUnits?: number;
};

export const seedCategories: SeedCategory[] = [
  {
    slug: "groceries",
    nameEn: "Groceries",
    nameMl: "പലചരക്ക്",
    description: "Everyday essentials, tea, coffee, sugar and salt.",
    emoji: "🛒",
    sortOrder: 3,
  },
  {
    slug: "vegetables",
    nameEn: "Vegetables",
    nameMl: "പച്ചക്കറികൾ",
    description: "Farm-fresh vegetables sourced daily from local farmers.",
    emoji: "🥕",
    sortOrder: 1,
  },
  {
    slug: "fruits",
    nameEn: "Fruits",
    nameMl: "പഴങ്ങൾ",
    description: "Seasonal and everyday fruits, ripened naturally.",
    emoji: "🍌",
    sortOrder: 2,
  },
  {
    slug: "leafy-greens",
    nameEn: "Leafy Greens",
    nameMl: "ഇലക്കറികൾ",
    description: "Tender greens and herbs, cut fresh every morning.",
    emoji: "🥬",
    sortOrder: 3,
  },
  {
    slug: "rice-and-grains",
    nameEn: "Rice & Grains",
    nameMl: "അരിയും ധാന്യങ്ങളും",
    description: "Kerala rice varieties, dals and flour.",
    emoji: "🌾",
    sortOrder: 4,
  },
  {
    slug: "spices",
    nameEn: "Spices",
    nameMl: "സുഗന്ധവ്യഞ്ജനങ്ങൾ",
    description: "Whole spices and fresh-ground powders.",
    emoji: "🌿",
    sortOrder: 5,
  },
  {
    slug: "dairy-and-eggs",
    nameEn: "Dairy & Eggs",
    nameMl: "പാലും മുട്ടയും",
    description: "Milk, curd, butter, ghee and farm eggs.",
    emoji: "🥛",
    sortOrder: 6,
  },
  {
    slug: "coconut-and-oils",
    nameEn: "Coconut & Oils",
    nameMl: "തേങ്ങയും എണ്ണകളും",
    description: "Coconut, coconut oil and cooking oils.",
    emoji: "🥥",
    sortOrder: 7,
  },
  {
    slug: "snacks-and-bakery",
    nameEn: "Snacks & Bakery",
    nameMl: "ലഹരികൾ",
    description: "Kerala banana chips, halwa, bread and more.",
    emoji: "🍪",
    sortOrder: 8,
  },
];

const loose = (
  slug: string,
  nameEn: string,
  nameMl: string,
  cat: string,
  emoji: string,
  perKgPaise: number,
  hsn: string,
  extra: Partial<SeedLooseProduct> = {},
): SeedLooseProduct => ({ slug, nameEn, nameMl, cat, emoji, perKgPaise, hsn, ...extra });

export const seedLooseProducts: SeedLooseProduct[] = [
  // ── Vegetables (36 items; prices ≈ Kerala market, Oct 2026) ───────────────
  loose("tomato", "Tomato", "തക്കാളി", "vegetables", "🍅", 3200, "0702", { freshToday: true }),
  loose("big-onion", "Onion (Big)", "വലിയ ഉള്ളി", "vegetables", "🧅", 4200, "0703", { freshToday: true }),
  loose("shallots", "Shallots", "ചെറുള്ളി", "vegetables", "🧅", 9500, "0703", {
    keywords: "small onion kunjulli cherulli",
  }),
  loose("potato", "Potato", "ഉരുളക്കിഴങ്ങ്", "vegetables", "🥔", 3400, "0701"),
  loose("green-chilli", "Green Chilli", "പച്ചമുളക്", "vegetables", "🌶️", 7000, "0709", {
    steps: [100, 250, 500, 1000],
  }),
  loose("brinjal", "Brinjal", "വഴുതന", "vegetables", "🍆", 4500, "0709", { freshToday: true }),
  loose("bitter-gourd", "Bitter Gourd", "പാവയ്ക്ക", "vegetables", "🥒", 5500, "0709"),
  loose("snake-gourd", "Snake Gourd", "പടവലം", "vegetables", "🥒", 4000, "0709", {
    keywords: "padavalam",
  }),
  loose("long-beans", "Long Beans", "പയർ", "vegetables", "🫛", 5000, "0709", {
    keywords: "ayar payar achinga",
  }),
  loose("ginger", "Ginger", "ഇഞ്ഞി", "vegetables", "🫚", 14000, "0910", {
    description: "Fresh Inji, cleaned and weighed loose.",
  }),
  loose("garlic", "Garlic", "വെളുത്തുള്ളി", "vegetables", "🧄", 17000, "0709"),
  loose("carrot", "Carrot", "കാരറ്റ്", "vegetables", "🥕", 6000, "0706", { freshToday: true }),
  loose("beetroot", "Beetroot", "ബീറ്റ്റൂട്ട്", "vegetables", "🫒", 4500, "0706"),
  loose("cabbage", "Cabbage", "കാബേജ്", "vegetables", "🥬", 2800, "0704"),
  loose("cauliflower", "Cauliflower", "കോളിഫ്ലവർ", "vegetables", "🥦", 5500, "0704"),
  loose("ash-gourd", "Ash Gourd", "കുംബളം", "vegetables", "🎃", 2400, "0709", {
    keywords: "kumbalanga",
  }),
  loose("pumpkin", "Pumpkin", "മത്തൻ", "vegetables", "🎃", 2800, "0709", { keywords: "mathanga" }),
  loose("cucumber", "Cucumber", "വെള്ളരിക്ക", "vegetables", "🥒", 3600, "0707", {
    keywords: "vellirikka",
  }),
  loose("ladies-finger", "Ladies Finger", "വെണ്ടയ്ക്ക", "vegetables", "🌿", 5000, "0709", {
    keywords: "okra vendakka",
    freshToday: true,
  }),
  loose("raw-banana", "Raw Banana", "പച്ചക്കേരള", "vegetables", "🍌", 4200, "0803", {
    keywords: "pachakkaya plantain kaya",
  }),
  loose("elephant-foot-yam", "Elephant Foot Yam", "ചേന", "vegetables", "🥔", 6500, "0714", {
    keywords: "chena suran",
  }),
  loose("colocasia", "Colocasia", "ചേമ്പ്", "vegetables", "🥔", 7500, "0714", {
    keywords: "chembu taro",
  }),
  loose("tapioca", "Tapioca", "കപ്പ", "vegetables", "🥔", 3800, "0714", {
    keywords: "kappa yuca cassava",
    freshToday: true,
  }),
  loose("capsicum", "Capsicum", "ക്യാപ്സിക്കം", "vegetables", "🫑", 8500, "0709"),
  loose("french-beans", "French Beans", "ബീൻസ്", "vegetables", "🫛", 9500, "0708", {
    stockGrams: 4000,
  }),
  loose("ivy-gourd", "Ivy Gourd", "കോവയ്ക്ക", "vegetables", "🥒", 4500, "0709", {
    keywords: "kovakka kovakkai tendli",
    freshToday: true,
  }),
  loose("ridge-gourd", "Ridge Gourd", "പീച്ചിൽ", "vegetables", "🥒", 4000, "0709", {
    keywords: "peechil peekka turai",
  }),
  loose("bottle-gourd", "Bottle Gourd", "ചുരക്ക", "vegetables", "🥒", 3000, "0709", {
    keywords: "churakka lauki",
  }),
  loose("cluster-beans", "Cluster Beans", "കോതവരക്ക", "vegetables", "🫛", 5500, "0709", {
    keywords: "kothavarikka goru chikkudi",
  }),
  loose("drumstick", "Drumstick", "മുരിങ്ങക്കായ", "vegetables", "🌿", 7000, "0709", {
    keywords: "muringakkai murungakkai moringa pods",
    freshToday: true,
  }),
  loose("radish", "Radish", "മുള്ളങ്ങി", "vegetables", "🌱", 3000, "0706", {
    keywords: "mullangi mooli",
  }),
  loose("sweet-potato", "Sweet Potato", "മധുരക്കിഴങ്ങ്", "vegetables", "🍠", 5500, "0714", {
    keywords: "madhurakizhangu chilakizhangu shakarkandi",
  }),
  loose("raw-papaya", "Raw Papaya", "കപ്പലങ്ങ", "vegetables", "🍈", 3500, "0709", {
    keywords: "kappalanga pacha pappaya green papaya",
  }),
  loose("mushroom", "Oyster Mushroom", "കൂൺ", "vegetables", "🍄", 11000, "0709", {
    keywords: "koona kalan chippu mushroom",
    freshToday: true,
  }),
  loose("green-peas", "Green Peas (Fresh)", "പച്ച ബടാണി", "vegetables", "🫛", 9000, "0708", {
    keywords: "pacha batani pattani fresh peas",
  }),
  loose("lemon-cucumber", "Lemon Cucumber", "കാണി വെള്ളരിക്ക", "vegetables", "🥒", 4000, "0707", {
    keywords: "kani vellarikka dosakai",
  }),

  // ── Fruits ────────────────────────────────────────────────────────────────
  loose("banana-robusta", "Banana (Robusta)", "വാഴപ്പഴം", "fruits", "🍌", 5000, "0803", {
    freshToday: true,
  }),
  loose("banana-nendran", "Nendran Banana", "നേന്ത്രപ്പഴം", "fruits", "🍌", 8000, "0803", {
    keywords: "nenthrapazham ethakka",
    freshToday: true,
  }),
  loose("papaya", "Papaya", "പപ്പായ", "fruits", "🫈", 4000, "0807", { keywords: "pappaya" }),
  loose("mango", "Mango (Seasonal)", "മാമ്പഴം", "fruits", "🥭", 12000, "0804", {
    stockGrams: 8000,
  }),
  loose("watermelon", "Watermelon", "തണ്ണീർമത്തൻ", "fruits", "🍉", 2500, "0807", {
    keywords: "thannimathan",
  }),
  loose("pineapple", "Pineapple", "പൈനാപ്പിൾ", "fruits", "🍍", 6000, "0804", {
    freshToday: true,
  }),
  loose("guava", "Guava", "പേരക്ക", "fruits", "🍏", 6000, "0804", { keywords: "perakka" }),
  loose("sapota", "Sapota", "സപ്പോട്ട", "fruits", "🟤", 7000, "0810", {
    keywords: "chikoo sapotta",
    stockGrams: 5000,
  }),
  loose("grapes-black", "Grapes (Black)", "മുന്തിരി", "fruits", "🍇", 9000, "0806"),
  loose("apple", "Apple (Shimla)", "ആപ്പിൾ", "fruits", "🍎", 18000, "0808", {
    steps: [500, 1000, 2000],
  }),
  loose("orange", "Orange", "ഓറഞ്ച്", "fruits", "🍊", 12000, "0805", { steps: [500, 1000, 2000] }),
  loose("avocado", "Avocado", "അവക്കാഡോ", "fruits", "🥑", 25000, "0804", {
    steps: [250, 500, 1000],
    stockGrams: 6000,
  }),
  loose("pomegranate", "Pomegranate", "മാതളനാരകം", "fruits", "🔴", 16000, "0810", {
    keywords: "mathalanarakam",
    steps: [500, 1000, 2000],
  }),

  // ── Leafy greens (100g bunch steps) ──────────────────────────────────────
  loose("red-amaranthus", "Red Amaranthus", "ചീര", "leafy-greens", "🥬", 3000, "0709", {
    steps: [100, 250, 500],
    step: 100,
    freshToday: true,
  }),
  loose("spinach", "Spinach", "പാളയ്ക്കീര", "leafy-greens", "🥬", 3500, "0709", {
    steps: [100, 250, 500],
    step: 100,
  }),
  loose("moringa-leaves", "Drumstick Leaves", "മുരിങ്ങയില", "leafy-greens", "🌿", 2500, "0709", {
    steps: [100, 250, 500],
    step: 100,
  }),
  loose("curry-leaves", "Curry Leaves", "കറിവേപ്പില", "leafy-greens", "🍃", 2000, "0709", {
    steps: [100, 250, 500],
    step: 100,
    keywords: "kariveppila",
  }),
  loose("coriander-leaves", "Coriander Leaves", "കൊത്തമല്ലി", "leafy-greens", "🌿", 4000, "0709", {
    steps: [100, 250, 500],
    step: 100,
    freshToday: true,
  }),
  loose("mint-leaves", "Mint Leaves", "പുതിന", "leafy-greens", "🌱", 4000, "0709", {
    steps: [100, 250, 500],
    step: 100,
  }),
  loose("spring-onion", "Spring Onion", "സ്പ്രിംഗ് ഉള്ളി", "leafy-greens", "🧅", 5000, "0703", {
    steps: [100, 250, 500],
    step: 100,
  }),
];

const packed = (
  slug: string,
  nameEn: string,
  nameMl: string,
  cat: string,
  emoji: string,
  hsn: string,
  gstRate: number,
  variants: SeedPackedProduct["variants"],
  extra: Partial<SeedPackedProduct> = {},
): SeedPackedProduct => ({ slug, nameEn, nameMl, cat, emoji, hsn, gstRate, variants, ...extra });

export const seedPackedProducts: SeedPackedProduct[] = [
  // ── Rice & grains ─────────────────────────────────────────────────────────
  packed(
    "matta-rice",
    "Matta Rice (Rosematta)",
    "മട്ട അരി",
    "rice-and-grains",
    "🌾",
    "1006",
    5,
    [
      { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 6800 },
      {
        labelEn: "5 kg",
        labelMl: "5 കി.ഗ്രാം",
        quantity: 5000,
        unitType: "weight",
        pricePaise: 32500,
        mrpPaise: 34000,
      },
      {
        labelEn: "10 kg",
        labelMl: "10 കി.ഗ്രാം",
        quantity: 10000,
        unitType: "weight",
        pricePaise: 64000,
        mrpPaise: 67000,
      },
    ],
    { stockUnits: 200000 },
  ),
  packed(
    "jeerakasala-rice",
    "Jeerakasala Rice",
    "ജീരകശാല അരി",
    "rice-and-grains",
    "🍚",
    "1006",
    5,
    [{ labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 12000 }],
    { stockUnits: 60000 },
  ),
  packed("sona-masoori-rice", "Sona Masoori Rice", "സോണ മസൂരി അരി", "rice-and-grains", "🍚", "1006", 5, [
    {
      labelEn: "5 kg",
      labelMl: "5 കി.ഗ്രാം",
      quantity: 5000,
      unitType: "weight",
      pricePaise: 47500,
      mrpPaise: 49500,
    },
  ]),
  packed("wheat-atta", "Whole Wheat Atta", "ഗോതമ്പ് അട്ട", "rice-and-grains", "🌾", "1101", 5, [
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 5500 },
    { labelEn: "5 kg", labelMl: "5 കി.ഗ്രാം", quantity: 5000, unitType: "weight", pricePaise: 26500 },
  ]),
  packed("puttu-podi", "Puttu Podi", "പുട്ടുപ്പൊടി", "rice-and-grains", "🍚", "1106", 5, [
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 7000 },
    { labelEn: "2 kg", labelMl: "2 കി.ഗ്രാം", quantity: 2000, unitType: "weight", pricePaise: 13700 },
  ]),
  packed("idiyappam-podi", "Idiyappam Podi", "ഇടിയപ്പപ്പൊടി", "rice-and-grains", "🍚", "1106", 5, [
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 8000 },
  ]),
  packed("toor-dal", "Toor Dal", "തുവര പരിപ്പ്", "rice-and-grains", "🫘", "0713", 5, [
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 8000 },
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 16000 },
  ]),
  packed("chana-dal", "Chana Dal", "കടല പരിപ്പ്", "rice-and-grains", "🫘", "0713", 5, [
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 6000 },
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 12000 },
  ]),
  packed("moong-dal", "Moong Dal", "മസൂർ പരിപ്പ്", "rice-and-grains", "🫘", "0713", 5, [
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 7000 },
  ]),
  packed("urad-dal", "Urad Dal (Split)", "ഉഴുന്ന പരിപ്പ്", "rice-and-grains", "🫘", "0713", 5, [
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 9000 },
  ]),
  packed("rava", "Wheat Rava", "റവ", "rice-and-grains", "🌾", "1103", 5, [
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 6000 },
  ]),

  // ── Spices ────────────────────────────────────────────────────────────────
  packed("chilli-powder", "Chilli Powder", "മുളക് പൊടി", "spices", "🌶️", "0904", 5, [
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 9500 },
    {
      labelEn: "500 g",
      labelMl: "500 ഗ്രാം",
      quantity: 500,
      unitType: "weight",
      pricePaise: 18000,
      mrpPaise: 19000,
    },
  ]),
  packed("turmeric-powder", "Turmeric Powder", "മഞ്ഞൾ പൊടി", "spices", "🟡", "0910", 5, [
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 6500 },
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 12000 },
  ]),
  packed("coriander-powder", "Coriander Powder", "കൊത്തമല്ലി പൊടി", "spices", "🟤", "0909", 5, [
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 7000 },
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 13000 },
  ]),
  packed("pepper-black", "Black Pepper", "കുരുമുളക്", "spices", "⚫", "0904", 5, [
    { labelEn: "100 g", labelMl: "100 ഗ്രാം", quantity: 100, unitType: "weight", pricePaise: 9000 },
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 21000 },
  ]),
  packed(
    "cardamom",
    "Cardamom (Green)",
    "ഏലക്കായ",
    "spices",
    "🟢",
    "0908",
    5,
    [{ labelEn: "50 g", labelMl: "50 ഗ്രാം", quantity: 50, unitType: "weight", pricePaise: 25000 }],
    { stockUnits: 400, lowStockUnits: 20 },
  ),
  packed("clove", "Clove", "ഗ്രാമ്പൂ", "spices", "🟤", "0907", 5, [
    { labelEn: "50 g", labelMl: "50 ഗ്രാം", quantity: 50, unitType: "weight", pricePaise: 16000 },
  ]),
  packed("cumin-seeds", "Cumin Seeds", "ജീരകം", "spices", "🌾", "0909", 5, [
    { labelEn: "100 g", labelMl: "100 ഗ്രാം", quantity: 100, unitType: "weight", pricePaise: 11000 },
  ]),
  packed("mustard-seeds", "Mustard Seeds", "കടുക്", "spices", "🟡", "1207", 5, [
    { labelEn: "200 g", labelMl: "200 ഗ്രാം", quantity: 200, unitType: "weight", pricePaise: 6000 },
  ]),
  packed("cinnamon", "Cinnamon Sticks", "കറുവപ്പട്ട", "spices", "🟤", "0906", 5, [
    { labelEn: "50 g", labelMl: "50 ഗ്രാം", quantity: 50, unitType: "weight", pricePaise: 8000 },
  ]),
  packed("garam-masala", "Garam Masala", "ഗരം മസാല", "spices", "🧂", "0910", 5, [
    { labelEn: "100 g", labelMl: "100 ഗ്രാം", quantity: 100, unitType: "weight", pricePaise: 9500 },
  ]),

  // ── Dairy & eggs ──────────────────────────────────────────────────────────
  packed(
    "farm-eggs",
    "Farm Eggs",
    "നാടൻ മുട്ട",
    "dairy-and-eggs",
    "🥚",
    "0407",
    0,
    [
      { labelEn: "6 eggs", labelMl: "6 മുട്ട", quantity: 6, unitType: "unit", pricePaise: 4200 },
      { labelEn: "12 eggs", labelMl: "12 മുട്ട", quantity: 12, unitType: "unit", pricePaise: 8200 },
      { labelEn: "30 tray", labelMl: "30 ട്രേ", quantity: 30, unitType: "unit", pricePaise: 21000 },
    ],
    { stockUnits: 400 },
  ),
  packed(
    "milk-pouch",
    "Toned Milk Pouch",
    "പാൽ പൗച്ച്",
    "dairy-and-eggs",
    "🥛",
    "0401",
    0,
    [{ labelEn: "500 ml", labelMl: "500 മി.ലി", quantity: 1, unitType: "unit", pricePaise: 2800 }],
    { brand: "Milma", stockUnits: 120, lowStockUnits: 30 },
  ),
  packed(
    "curd",
    "Curd (Set)",
    "തൈര്",
    "dairy-and-eggs",
    "🥣",
    "0403",
    5,
    [{ labelEn: "400 g cup", labelMl: "400 ഗ്രാം കപ്പ്", quantity: 1, unitType: "unit", pricePaise: 3500 }],
    { brand: "Milma" },
  ),
  packed(
    "butter",
    "Butter",
    "വെണ്ണ",
    "dairy-and-eggs",
    "🧈",
    "0405",
    12,
    [
      { labelEn: "100 g", labelMl: "100 ഗ്രാം", quantity: 1, unitType: "unit", pricePaise: 6200 },
      { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 1, unitType: "unit", pricePaise: 29500 },
    ],
    { brand: "Amul" },
  ),
  packed(
    "ghee",
    "Ghee",
    "നെയ്യ്",
    "dairy-and-eggs",
    "🫙",
    "0405",
    12,
    [
      {
        labelEn: "500 ml",
        labelMl: "500 മി.ലി",
        quantity: 1,
        unitType: "unit",
        pricePaise: 34900,
        mrpPaise: 36500,
      },
    ],
    { brand: "Milma" },
  ),
  packed("paneer", "Paneer", "പനീർ", "dairy-and-eggs", "🧆", "0406", 12, [
    { labelEn: "200 g", labelMl: "200 ഗ്രാം", quantity: 1, unitType: "unit", pricePaise: 9500 },
  ]),

  // ── Coconut & oils ────────────────────────────────────────────────────────
  packed(
    "coconut",
    "Coconut (Whole)",
    "തേങ്ങ",
    "coconut-and-oils",
    "🥥",
    "0801",
    0,
    [{ labelEn: "1 piece", labelMl: "1 എണ്ണം", quantity: 1, unitType: "unit", pricePaise: 4000 }],
    { stockUnits: 150 },
  ),
  packed(
    "coconut-oil",
    "Coconut Oil",
    "വെളിച്ചെണ്ണ",
    "coconut-and-oils",
    "🫗",
    "1513",
    5,
    [
      { labelEn: "500 ml", labelMl: "500 മി.ലി", quantity: 1, unitType: "unit", pricePaise: 16500 },
      {
        labelEn: "1 litre",
        labelMl: "1 ലിറ്റർ",
        quantity: 1,
        unitType: "unit",
        pricePaise: 32000,
        mrpPaise: 33500,
      },
    ],
    { stockUnits: 90, lowStockUnits: 20 },
  ),
  packed(
    "sunflower-oil",
    "Sunflower Oil",
    "സൂര്യകാന്തി എണ്ണ",
    "coconut-and-oils",
    "🌻",
    "1512",
    5,
    [{ labelEn: "1 litre", labelMl: "1 ലിറ്റർ", quantity: 1, unitType: "unit", pricePaise: 14500 }],
    { stockUnits: 0, lowStockUnits: 10 },
  ),

  // ── Snacks & bakery ───────────────────────────────────────────────────────
  packed(
    "banana-chips",
    "Banana Chips",
    "ബനാന ചിപ്സ്",
    "snacks-and-bakery",
    "🍟",
    "2005",
    12,
    [
      { labelEn: "200 g", labelMl: "200 ഗ്രാം", quantity: 200, unitType: "weight", pricePaise: 9500 },
      { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 23000 },
    ],
    { stockUnits: 50000 },
  ),
  packed("sarkara-varatti", "Sarkara Varatti", "ശർക്കര വരട്ടിയത്", "snacks-and-bakery", "🍌", "2005", 12, [
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 15000 },
  ]),
  packed("jackfruit-chips", "Jackfruit Chips", "ചക്ക വരട്ടിയത്", "snacks-and-bakery", "🍟", "2005", 12, [
    { labelEn: "200 g", labelMl: "200 ഗ്രാം", quantity: 200, unitType: "weight", pricePaise: 12000 },
  ]),
  packed("achappam", "Achappam (Rose Cookies)", "അച്ചപ്പം", "snacks-and-bakery", "🍪", "1905", 12, [
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 11000 },
  ]),
  packed("kozhikode-halwa", "Kozhikode Halwa", "കോഴിക്കോട് ഹൽവ", "snacks-and-bakery", "🍬", "2106", 12, [
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 12000 },
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 22000 },
  ]),
  packed("bread", "Sandwich Bread", "ബ്രെഡ്", "snacks-and-bakery", "🍞", "1905", 5, [
    { labelEn: "400 g", labelMl: "400 ഗ്രാം", quantity: 1, unitType: "unit", pricePaise: 4500 },
  ]),
  packed("tea-dust", "Tea Dust", "ചായപ്പൊടി", "groceries", "🍵", "0902", 5, [
    { labelEn: "250 g", labelMl: "250 ഗ്രാം", quantity: 250, unitType: "weight", pricePaise: 9500 },
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 18000 },
  ]),
  packed("coffee-powder", "Coffee Powder (70:30)", "കാപി പൊടി", "groceries", "☕", "0901", 5, [
    { labelEn: "200 g", labelMl: "200 ഗ്രാം", quantity: 200, unitType: "weight", pricePaise: 13000 },
  ]),
  packed("sugar", "Sugar", "പഞ്ചസാര", "groceries", "🧂", "1701", 5, [
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 4800 },
  ]),
  packed("salt", "Iodised Salt", "ഉപ്പ്", "groceries", "🧂", "2501", 5, [
    { labelEn: "1 kg", labelMl: "1 കി.ഗ്രാം", quantity: 1000, unitType: "weight", pricePaise: 2500 },
  ]),
  packed("jaggery", "Jaggery (Block)", "ശർക്കര", "groceries", "🟫", "1702", 5, [
    { labelEn: "500 g", labelMl: "500 ഗ്രാം", quantity: 500, unitType: "weight", pricePaise: 6000 },
  ]),
];

/** Demo zones for Kottayam only; configure actual coverage and fees before launch. */
export const seedZones = [
  {
    pincode: "686001",
    areaNameEn: "Kottayam Town",
    areaNameMl: "കോട്ടയം ടൗൺ",
    minOrderPaise: 9900,
    deliveryFeePaise: 2900,
    freeDeliveryThresholdPaise: 49900,
  },
  {
    pincode: "686631",
    areaNameEn: "Ettumanoor",
    areaNameMl: "ഏറ്റുമാനൂർ",
    minOrderPaise: 14900,
    deliveryFeePaise: 3900,
    freeDeliveryThresholdPaise: 59900,
  },
  {
    pincode: "686575",
    areaNameEn: "Pala",
    areaNameMl: "പാലാ",
    minOrderPaise: 19900,
    deliveryFeePaise: 4900,
    freeDeliveryThresholdPaise: 69900,
  },
  {
    pincode: "686101",
    areaNameEn: "Changanassery",
    areaNameMl: "ചങ്ങനാശ്ശേരി",
    minOrderPaise: 19900,
    deliveryFeePaise: 4900,
    freeDeliveryThresholdPaise: 69900,
  },
  {
    pincode: "686141",
    areaNameEn: "Vaikom",
    areaNameMl: "വൈക്കം",
    minOrderPaise: 24900,
    deliveryFeePaise: 5900,
    freeDeliveryThresholdPaise: 79900,
  },
];

export const seedSlots = [
  {
    nameEn: "Morning 7 AM – 9 AM",
    nameMl: "രാവിലെ 7 – 9 മണി",
    startMinutes: 420,
    endMinutes: 540,
    cutoffMinutes: 600,
    capacity: 40,
    sortOrder: 1,
  },
  {
    nameEn: "Evening 5 PM – 7 PM",
    nameMl: "വൈകുന്നേരം 5 – 7 മണി",
    startMinutes: 1020,
    endMinutes: 1140,
    cutoffMinutes: 300,
    capacity: 50,
    sortOrder: 2,
  },
];

export const seedCoupons = [
  {
    code: "WELCOME10",
    couponType: "percent" as const,
    value: 10,
    minOrderPaise: 19900,
    maxDiscountPaise: 5000,
    perUserLimit: 1,
    firstOrderOnly: true,
    validDays: 365,
  },
  {
    code: "FLAT30",
    couponType: "flat" as const,
    value: 3000,
    minOrderPaise: 49900,
    maxDiscountPaise: null,
    perUserLimit: 3,
    firstOrderOnly: false,
    validDays: 180,
  },
];
