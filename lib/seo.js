'use strict';
const config = require('./env');

// Crawlable landing pages for the main Trieste neighbourhoods.
// Content is deliberately factual and modest: no invented addresses or ratings.
const AREAS = [
  {
    slug: 'centro',
    area: 'Centro',
    it: {
      title: 'Parcheggi a Trieste Centro',
      description: 'Trova e prenota un parcheggio nel Centro di Trieste, vicino a Piazza Unità d’Italia e Corso Italia. Richiesta gratuita, conferma in pochi minuti.',
      intro: 'Il centro di Trieste è la zona più trafficata della città: Piazza Unità d’Italia, Corso Italia, i portici e le vie dello shopping. Prenotare in anticipo un posto auto qui evita di girare a lungo alla ricerca di un parcheggio.',
      highlights: ['Vicino a Piazza Unità d’Italia', 'Corso Italia e centro commerciale', 'Ideale per passeggiate e lavoro']
    },
    en: {
      title: 'Parking in Trieste Centro',
      description: 'Find and book parking in Trieste city centre, near Piazza Unità d’Italia and Corso Italia. Free request, confirmation in minutes.',
      intro: 'Trieste city centre is the busiest part of town: Piazza Unità d’Italia, Corso Italia, the arcades and the shopping streets. Booking a parking space in advance here saves you driving around looking for a spot.',
      highlights: ['Near Piazza Unità d’Italia', 'Corso Italia and shops', 'Great for sightseeing and work']
    }
  },
  {
    slug: 'stazione',
    area: 'Stazione',
    it: {
      title: 'Parcheggi vicino alla Stazione di Trieste',
      description: 'Parcheggio vicino a Trieste Centrale e Piazza della Libertà. Prenota il tuo posto auto online e ricevi la conferma prima di arrivare.',
      intro: 'La zona della Stazione Centrale è il punto di arrivo di chi viaggia in treno. Un posto auto prenotato vicino a Piazza della Libertà rende molto più semplice iniziare il viaggio o la giornata in città.',
      highlights: ['Vicino a Trieste Centrale', 'Piazza della Libertà', 'Comodo per treni e autobus']
    },
    en: {
      title: 'Parking near Trieste Centrale station',
      description: 'Parking near Trieste Centrale railway station and Piazza della Libertà. Book your space online and get confirmed before you arrive.',
      intro: 'The area around Trieste Centrale is where train travellers arrive. A pre-booked space near Piazza della Libertà makes starting your trip or your day in the city much easier.',
      highlights: ['Close to Trieste Centrale', 'Piazza della Libertà', 'Convenient for trains and buses']
    }
  },
  {
    slug: 'cattinara',
    area: 'Cattinara',
    it: {
      title: 'Parcheggi a Cattinara, Trieste',
      description: 'Trova un parcheggio a Cattinara, vicino all’Ospedale Maggiore e all’Università di Trieste. Prenota online senza account.',
      intro: 'Cattinara è la zona dell’Ospedale Maggiore e del polo universitario di Trieste. È spesso frequentata da pazienti, studenti e personale: prenotare un posto auto in anticipo riduce il tempo perso a cercare parcheggio.',
      highlights: ['Vicino all’Ospedale Maggiore', 'Università e facoltà mediche', 'Utile per visite e studio']
    },
    en: {
      title: 'Parking in Cattinara, Trieste',
      description: 'Find parking in Cattinara, near Trieste’s main hospital and the University. Book online with no account needed.',
      intro: 'Cattinara is the area of Trieste’s main hospital and university campus. Patients, students and staff all come here, so booking a parking space ahead of time cuts the time spent circling for a spot.',
      highlights: ['Near the main hospital', 'University and medical faculties', 'Useful for appointments and study']
    }
  },
  {
    slug: 'barcola',
    area: 'Barcola',
    it: {
      title: 'Parcheggi a Barcola, Trieste',
      description: 'Parcheggio a Barcola, sul lungomare di Trieste. Prenota uno spazio vicino al mare per la tua passeggiata o giornata in spiaggia.',
      intro: 'Barcola è il lungomare più amato di Trieste, con la passeggiata sul mare e gli stabilimenti balneari. Nella stagione estiva i parcheggi si riempiono presto: prenotare prima ti garantisce più tranquillità.',
      highlights: ['Sul lungomare di Trieste', 'Vicino agli stabilimenti balneari', 'Ideale per la stagione estiva']
    },
    en: {
      title: 'Parking in Barcola, Trieste',
      description: 'Parking in Barcola, on Trieste’s seafront. Book a space near the sea for your walk or a day at the beach.',
      intro: 'Barcola is Trieste’s best-loved seafront, with its promenade and beach clubs. In summer the parking fills up early, so booking ahead gives you peace of mind.',
      highlights: ['On Trieste’s seafront', 'Close to the beach clubs', 'Ideal in the summer season']
    }
  },
  {
    slug: 'porto-vecchio',
    area: 'Porto Vecchio',
    it: {
      title: 'Parcheggi al Porto Vecchio di Trieste',
      description: 'Prenota un parcheggio al Porto Vecchio di Trieste, zona di eventi e riqualificazione. Prenotazione semplice e senza pagamento immediato.',
      intro: 'Il Porto Vecchio è l’ex area portuale di Trieste, oggi in trasformazione e spesso sede di mostre ed eventi. È una zona ampia, dove trovare un posto auto prenotato può fare la differenza nei giorni di affluenza.',
      highlights: ['Ex area portuale in riqualificazione', 'Mostre ed eventi', 'Spazi ampi']
    },
    en: {
      title: 'Parking at Trieste Porto Vecchio',
      description: 'Book parking at Trieste Porto Vecchio, an area for events and redevelopment. Simple booking with no immediate payment.',
      intro: 'Porto Vecchio is Trieste’s former port area, now being redeveloped and often hosting exhibitions and events. It is a large area where a reserved parking space can make a real difference on busy days.',
      highlights: ['Former port area being redeveloped', 'Exhibitions and events', 'Plenty of space']
    }
  },
  {
    slug: 'stadio',
    area: 'Stadio',
    it: {
      title: 'Parcheggi vicino allo Stadio di Trieste',
      description: 'Parcheggio vicino allo Stadio Nereo Rocco di Trieste. Prenota il posto auto prima della partita o del concerto.',
      intro: 'La zona dello Stadio Nereo Rocco si riempie nelle giornate di partita e di eventi. Prenotare un posto auto con anticipo ti permette di arrivare tranquillo e senza cercare parcheggio all’ultimo momento.',
      highlights: ['Vicino allo Stadio Nereo Rocco', 'Ideale nelle giornate di eventi', 'Arriva senza stress']
    },
    en: {
      title: 'Parking near Trieste stadium',
      description: 'Parking near Stadio Nereo Rocco in Trieste. Book your space before the match or concert.',
      intro: 'The area around Stadio Nereo Rocco gets busy on match and event days. Booking a parking space in advance means you can arrive relaxed instead of hunting for a spot at the last minute.',
      highlights: ['Near Stadio Nereo Rocco', 'Ideal on event days', 'Arrive stress-free']
    }
  }
];

function areaBySlug(slug) {
  return AREAS.find(a => a.slug === slug) || null;
}

function absolute(path) {
  const base = String(config.baseUrl || '').replace(/\/$/, '');
  if (/^https?:\/\//i.test(path)) return path;
  return base + (path.startsWith('/') ? path : '/' + path);
}

function withLang(path, lang) {
  if (lang !== 'en') return path;
  return path + (path.includes('?') ? '&' : '?') + 'lang=en';
}

/**
 * Build the SEO object consumed by the layout.
 * `path` must be a clean, canonical path (no volatile date/time parameters).
 */
function meta({ lang = 'it', title, description, path = '/', image = '', type = 'website', noindex = false, robots = '', jsonLd = null }) {
  const itHref = absolute(path);
  const enHref = absolute(withLang(path, 'en'));
  return {
    title: title || 'ParkTrieste',
    description: description || '',
    canonical: absolute(withLang(path, lang)),
    robots: robots || (noindex ? 'noindex,nofollow' : 'index,follow'),
    type,
    image: image ? absolute(image) : '',
    jsonLd,
    verification: config.googleSiteVerification || '',
    alternates: [
      { hreflang: 'it', href: itHref },
      { hreflang: 'en', href: enHref },
      { hreflang: 'x-default', href: itHref }
    ],
    ogLocale: lang === 'en' ? 'en_US' : 'it_IT'
  };
}

function websiteSchema(description) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'ParkTrieste',
    url: absolute('/'),
    description,
    inLanguage: ['it', 'en']
  };
}

function listingSchema(listing, image) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'ParkingFacility',
    name: listing.name,
    description: listing.notes || `Parcheggio a ${listing.area}, Trieste`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Trieste',
      addressRegion: 'Friuli-Venezia Giulia',
      addressCountry: 'IT'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: Number(listing.lat),
      longitude: Number(listing.lng)
    },
    priceRange: '€' + Number(listing.price_hour).toFixed(2)
  };
  if (listing.address) schema.address.streetAddress = listing.address;
  if (image) schema.image = absolute(image);
  if (!listing.is_example && Number(listing.review_count) > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(listing.rating).toFixed(1),
      reviewCount: Number(listing.review_count)
    };
  }
  return schema;
}

function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(item.path)
    }))
  };
}

module.exports = {
  AREAS, areaBySlug, absolute, withLang, meta,
  websiteSchema, listingSchema, breadcrumbSchema
};
