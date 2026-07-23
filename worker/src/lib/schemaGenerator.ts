// ============================================================
// schemaGenerator.ts — генерація JSON-LD (Schema.org) для
// публічної Qorax SEO Platform (Developer API).
//
// Узгоджено з Артемом: Schema API — ЧИСТА шаблонізація, без AI
// (на відміну від майбутнього AI SEO API). Приймає структуровані
// поля (назва бізнесу, адреса, питання/відповіді тощо), повертає
// готовий валідний JSON-LD об'єкт — той самий формат, що вже
// детектується (не генерується) у seoChecker.ts::fetchMeta()
// (schemaScripts/schemaTypes, виявлення наявної розмітки на чужих
// сайтах). Ця генерація — протилежна дія: створення нової розмітки
// з нуля за описом.
//
// Підтримувані типи — дослівно з початкового документа Артема:
// Organization, Product, FAQPage, LocalBusiness, BreadcrumbList,
// Article, Event, Person.
// ============================================================

export type SchemaType =
  | "Organization"
  | "Product"
  | "FAQPage"
  | "LocalBusiness"
  | "BreadcrumbList"
  | "Article"
  | "Event"
  | "Person";

export interface SchemaGenerationResult {
  ok: boolean;
  jsonLd?: Record<string, unknown>;
  scriptTag?: string;
  error?: string;
}

function wrapAsScriptTag(jsonLd: Record<string, unknown>): string {
  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`;
}

/** Прибирає undefined-поля з об'єкта — Schema.org споживачі (Google
 * Rich Results тощо) не повинні бачити "extra": undefined у виводі. */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

interface OrganizationInput {
  name: string;
  url?: string;
  logo?: string;
  description?: string;
  sameAs?: string[]; // соцмережі
  telephone?: string;
  email?: string;
}

function generateOrganization(input: OrganizationInput): SchemaGenerationResult {
  if (!input.name) return { ok: false, error: "Поле name обов'язкове для Organization" };
  const jsonLd = pruneUndefined({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: input.url,
    logo: input.logo,
    description: input.description,
    sameAs: input.sameAs,
    telephone: input.telephone,
    email: input.email,
  });
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

interface ProductInput {
  name: string;
  description?: string;
  image?: string;
  sku?: string;
  brand?: string;
  priceCurrency?: string;
  price?: string | number;
  availability?: "InStock" | "OutOfStock" | "PreOrder";
  ratingValue?: number;
  reviewCount?: number;
}

function generateProduct(input: ProductInput): SchemaGenerationResult {
  if (!input.name) return { ok: false, error: "Поле name обов'язкове для Product" };
  const jsonLd = pruneUndefined({
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    image: input.image,
    sku: input.sku,
    brand: input.brand ? { "@type": "Brand", name: input.brand } : undefined,
    offers:
      input.price !== undefined
        ? pruneUndefined({
            "@type": "Offer",
            priceCurrency: input.priceCurrency ?? "USD",
            price: String(input.price),
            availability: input.availability ? `https://schema.org/${input.availability}` : undefined,
          })
        : undefined,
    aggregateRating:
      input.ratingValue !== undefined
        ? pruneUndefined({
            "@type": "AggregateRating",
            ratingValue: input.ratingValue,
            reviewCount: input.reviewCount ?? 1,
          })
        : undefined,
  });
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

interface FaqInput {
  questions: Array<{ question: string; answer: string }>;
}

function generateFaqPage(input: FaqInput): SchemaGenerationResult {
  if (!Array.isArray(input.questions) || input.questions.length === 0) {
    return { ok: false, error: "Поле questions обов'язкове й має містити хоча б одну пару question/answer" };
  }
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: input.questions.map(q => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

interface LocalBusinessInput {
  name: string;
  image?: string;
  telephone?: string;
  priceRange?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
  latitude?: number;
  longitude?: number;
  openingHours?: string[]; // напр. ["Mo-Fr 09:00-18:00"]
}

function generateLocalBusiness(input: LocalBusinessInput): SchemaGenerationResult {
  if (!input.name) return { ok: false, error: "Поле name обов'язкове для LocalBusiness" };
  const hasAddress = input.streetAddress || input.addressLocality;
  const jsonLd = pruneUndefined({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: input.name,
    image: input.image,
    telephone: input.telephone,
    priceRange: input.priceRange,
    address: hasAddress
      ? pruneUndefined({
          "@type": "PostalAddress",
          streetAddress: input.streetAddress,
          addressLocality: input.addressLocality,
          addressRegion: input.addressRegion,
          postalCode: input.postalCode,
          addressCountry: input.addressCountry,
        })
      : undefined,
    geo:
      input.latitude !== undefined && input.longitude !== undefined
        ? { "@type": "GeoCoordinates", latitude: input.latitude, longitude: input.longitude }
        : undefined,
    openingHours: input.openingHours,
  });
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

interface BreadcrumbInput {
  items: Array<{ name: string; url: string }>;
}

function generateBreadcrumbList(input: BreadcrumbInput): SchemaGenerationResult {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: "Поле items обов'язкове й має містити хоча б один пункт" };
  }
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: input.items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

interface ArticleInput {
  headline: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  authorName?: string;
  publisherName?: string;
  publisherLogo?: string;
  description?: string;
}

function generateArticle(input: ArticleInput): SchemaGenerationResult {
  if (!input.headline) return { ok: false, error: "Поле headline обов'язкове для Article" };
  const jsonLd = pruneUndefined({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.headline,
    image: input.image,
    datePublished: input.datePublished,
    dateModified: input.dateModified ?? input.datePublished,
    description: input.description,
    author: input.authorName ? { "@type": "Person", name: input.authorName } : undefined,
    publisher: input.publisherName
      ? pruneUndefined({
          "@type": "Organization",
          name: input.publisherName,
          logo: input.publisherLogo ? { "@type": "ImageObject", url: input.publisherLogo } : undefined,
        })
      : undefined,
  });
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

interface EventInput {
  name: string;
  startDate: string;
  endDate?: string;
  locationName?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressCountry?: string;
  isOnline?: boolean;
  onlineUrl?: string;
  description?: string;
  image?: string;
}

function generateEvent(input: EventInput): SchemaGenerationResult {
  if (!input.name) return { ok: false, error: "Поле name обов'язкове для Event" };
  if (!input.startDate) return { ok: false, error: "Поле startDate обов'язкове для Event" };
  const jsonLd = pruneUndefined({
    "@context": "https://schema.org",
    "@type": "Event",
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    description: input.description,
    image: input.image,
    eventAttendanceMode: input.isOnline
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: input.isOnline
      ? pruneUndefined({ "@type": "VirtualLocation", url: input.onlineUrl })
      : pruneUndefined({
          "@type": "Place",
          name: input.locationName,
          address: pruneUndefined({
            "@type": "PostalAddress",
            streetAddress: input.streetAddress,
            addressLocality: input.addressLocality,
            addressCountry: input.addressCountry,
          }),
        }),
  });
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

interface PersonInput {
  name: string;
  jobTitle?: string;
  url?: string;
  image?: string;
  sameAs?: string[];
  worksForName?: string;
}

function generatePerson(input: PersonInput): SchemaGenerationResult {
  if (!input.name) return { ok: false, error: "Поле name обов'язкове для Person" };
  const jsonLd = pruneUndefined({
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    jobTitle: input.jobTitle,
    url: input.url,
    image: input.image,
    sameAs: input.sameAs,
    worksFor: input.worksForName ? { "@type": "Organization", name: input.worksForName } : undefined,
  });
  return { ok: true, jsonLd, scriptTag: wrapAsScriptTag(jsonLd) };
}

/**
 * Єдина точка входу для /api/v1/schema — диспетчер за полем `type`.
 * `fields` — сирий об'єкт з тіла запиту, типізація полів під кожен
 * генератор відбувається неявно (кожна generate*-функція сама
 * перевіряє обов'язкові поля й повертає ok:false з чіткою помилкою,
 * якщо чогось бракує — не кидає виключення на невідповідний тип).
 */
export function generateSchema(type: string, fields: Record<string, unknown>): SchemaGenerationResult {
  switch (type as SchemaType) {
    case "Organization":
      return generateOrganization(fields as unknown as OrganizationInput);
    case "Product":
      return generateProduct(fields as unknown as ProductInput);
    case "FAQPage":
      return generateFaqPage(fields as unknown as FaqInput);
    case "LocalBusiness":
      return generateLocalBusiness(fields as unknown as LocalBusinessInput);
    case "BreadcrumbList":
      return generateBreadcrumbList(fields as unknown as BreadcrumbInput);
    case "Article":
      return generateArticle(fields as unknown as ArticleInput);
    case "Event":
      return generateEvent(fields as unknown as EventInput);
    case "Person":
      return generatePerson(fields as unknown as PersonInput);
    default:
      return {
        ok: false,
        error: `Невідомий тип "${type}". Підтримується: Organization, Product, FAQPage, LocalBusiness, BreadcrumbList, Article, Event, Person`,
      };
  }
}
