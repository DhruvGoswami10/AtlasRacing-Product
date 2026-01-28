/**
 * Driver Name Alias System
 * Maps short names (MAX, LEWIS, VER) to full names (VERSTAPPEN, HAMILTON)
 */

export interface DriverAlias {
  fullName: string;
  aliases: string[];
  number?: string;
  displayName: string;
}

// F1 2024/2025 Grid
export const DRIVER_ALIASES: DriverAlias[] = [
  {
    fullName: 'VERSTAPPEN',
    displayName: 'Max Verstappen',
    aliases: ['MAX', 'MAX VERSTAPPEN', 'VERSTAPPEN', 'VER'],
    number: '33',
  },
  {
    fullName: 'PEREZ',
    displayName: 'Sergio Perez',
    aliases: ['CHECO', 'CHECO PEREZ', 'SERGIO', 'SERGIO PEREZ', 'PEREZ', 'PER'],
    number: '11',
  },
  {
    fullName: 'HAMILTON',
    displayName: 'Lewis Hamilton',
    aliases: ['LEWIS', 'LEWIS HAMILTON', 'HAMILTON', 'HAM'],
    number: '44',
  },
  {
    fullName: 'RUSSELL',
    displayName: 'George Russell',
    aliases: ['GEORGE', 'GEORGE RUSSELL', 'RUSSELL', 'RUS'],
    number: '63',
  },
  {
    fullName: 'LECLERC',
    displayName: 'Charles Leclerc',
    aliases: ['CHARLES', 'CHARLES LECLERC', 'LECLERC', 'LEC'],
    number: '16',
  },
  {
    fullName: 'SAINZ',
    displayName: 'Carlos Sainz',
    aliases: ['CARLOS', 'CARLOS SAINZ', 'SAINZ', 'SAI'],
    number: '55',
  },
  {
    fullName: 'NORRIS',
    displayName: 'Lando Norris',
    aliases: ['LANDO', 'LANDO NORRIS', 'NORRIS', 'NOR'],
    number: '4',
  },
  {
    fullName: 'PIASTRI',
    displayName: 'Oscar Piastri',
    aliases: ['OSCAR', 'OSCAR PIASTRI', 'PIASTRI', 'PIA'],
    number: '81',
  },
  {
    fullName: 'ALONSO',
    displayName: 'Fernando Alonso',
    aliases: ['FERNANDO', 'FERNANDO ALONSO', 'ALONSO', 'ALO'],
    number: '14',
  },
  {
    fullName: 'STROLL',
    displayName: 'Lance Stroll',
    aliases: ['LANCE', 'LANCE STROLL', 'STROLL', 'STR'],
    number: '18',
  },
  {
    fullName: 'OCON',
    displayName: 'Esteban Ocon',
    aliases: ['ESTEBAN', 'ESTEBAN OCON', 'OCON', 'OCO'],
    number: '31',
  },
  {
    fullName: 'GASLY',
    displayName: 'Pierre Gasly',
    aliases: ['PIERRE', 'PIERRE GASLY', 'GASLY', 'GAS'],
    number: '10',
  },
  {
    fullName: 'ALBON',
    displayName: 'Alex Albon',
    aliases: ['ALEX', 'ALEX ALBON', 'ALBON', 'ALB'],
    number: '23',
  },
  {
    fullName: 'SARGEANT',
    displayName: 'Logan Sargeant',
    aliases: ['LOGAN', 'LOGAN SARGEANT', 'SARGEANT', 'SAR'],
    number: '2',
  },
  {
    fullName: 'TSUNODA',
    displayName: 'Yuki Tsunoda',
    aliases: ['YUKI', 'YUKI TSUNODA', 'TSUNODA', 'TSU'],
    number: '22',
  },
  {
    fullName: 'RICCIARDO',
    displayName: 'Daniel Ricciardo',
    aliases: ['DANIEL', 'DANIEL RICCIARDO', 'RICCIARDO', 'RIC'],
    number: '3',
  },
  {
    fullName: 'HULKENBERG',
    displayName: 'Nico Hulkenberg',
    aliases: ['NICO', 'NICO HULKENBERG', 'HULKENBERG', 'HUL'],
    number: '27',
  },
  {
    fullName: 'MAGNUSSEN',
    displayName: 'Kevin Magnussen',
    aliases: ['KEVIN', 'KEVIN MAGNUSSEN', 'MAGNUSSEN', 'MAG'],
    number: '20',
  },
  {
    fullName: 'BOTTAS',
    displayName: 'Valtteri Bottas',
    aliases: ['VALTTERI', 'VALTTERI BOTTAS', 'BOTTAS', 'BOT'],
    number: '77',
  },
  {
    fullName: 'ZHOU',
    displayName: 'Guanyu Zhou',
    aliases: ['GUANYU', 'GUANYU ZHOU', 'ZHOU', 'ZHO'],
    number: '24',
  },
  // F1 2025 new drivers
  {
    fullName: 'ANTONELLI',
    displayName: 'Kimi Antonelli',
    aliases: ['KIMI', 'KIMI ANTONELLI', 'ANTONELLI', 'ANT'],
    number: '12',
  },
  {
    fullName: 'BEARMAN',
    displayName: 'Ollie Bearman',
    aliases: ['OLLIE', 'OLLIE BEARMAN', 'BEARMAN', 'BEA', 'OLIVER', 'OLIVER BEARMAN'],
    number: '50',
  },
  {
    fullName: 'LAWSON',
    displayName: 'Liam Lawson',
    aliases: ['LIAM', 'LIAM LAWSON', 'LAWSON', 'LAW'],
    number: '40',
  },
  {
    fullName: 'COLAPINTO',
    displayName: 'Franco Colapinto',
    aliases: ['FRANCO', 'FRANCO COLAPINTO', 'COLAPINTO', 'COL'],
    number: '43',
  },
  {
    fullName: 'HADJAR',
    displayName: 'Isack Hadjar',
    aliases: ['ISACK', 'ISACK HADJAR', 'HADJAR', 'HAD'],
    number: '25',
  },
];

const FULL_NAME_MAP = new Map<string, DriverAlias>();
const ALIAS_MAP = new Map<string, DriverAlias>();

DRIVER_ALIASES.forEach(alias => {
  const canonical = alias.fullName.toUpperCase();
  FULL_NAME_MAP.set(canonical, alias);

  const aliasTerms = new Set<string>([
    alias.fullName,
    ...alias.aliases,
    ...(alias.number ? [alias.number] : []),
  ]);

  aliasTerms.forEach(term => {
    const sanitized = term.toUpperCase().replace(/\s+/g, ' ').trim();
    if (sanitized) {
      ALIAS_MAP.set(sanitized, alias);
    }
  });
});

const NORMALIZE_PATTERNS = Array.from(ALIAS_MAP.entries()).map(([term, alias]) => {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    regex: new RegExp(`\\b${escaped}\\b`, 'gi'),
    replacement: alias.fullName,
  };
});

const NON_ALPHANUMERIC = /[^A-Z0-9\s]/g;

function sanitizeTerm(input: string): string {
  return input
    .toUpperCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lookupAlias(term: string): DriverAlias | null {
  if (!term) {
    return null;
  }
  const normalized = term.replace(/\s+/g, ' ').trim();
  return ALIAS_MAP.get(term) ?? ALIAS_MAP.get(normalized) ?? null;
}

export function getDriverAlias(fullName: string): DriverAlias | null {
  if (!fullName) {
    return null;
  }
  return FULL_NAME_MAP.get(sanitizeTerm(fullName)) ?? null;
}

export function getDriverDisplayName(fullName: string): string {
  const alias = getDriverAlias(fullName);
  if (alias) {
    return alias.displayName;
  }
  const normalized = fullName.replace(/_/g, ' ').toLowerCase();
  return normalized.replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Find driver full name from any alias
 * @param input - Short name like "MAX", "LEWIS", "VER"
 * @returns Full name like "VERSTAPPEN", "HAMILTON" or null if not found
 */
export function resolveDriverName(input: string): string | null {
  if (!input) {
    return null;
  }

  const searchTerm = sanitizeTerm(input);
  if (!searchTerm) {
    return null;
  }

  const direct = lookupAlias(searchTerm);
  if (direct) {
    return direct.fullName;
  }

  if (searchTerm.includes(' ')) {
    const words = searchTerm.split(' ');
    for (let span = Math.min(3, words.length); span >= 1; span--) {
      for (let index = 0; index + span <= words.length; index++) {
        const candidate = words.slice(index, index + span).join(' ');
        if (candidate === searchTerm) {
          continue;
        }
        const resolved = lookupAlias(candidate);
        if (resolved) {
          return resolved.fullName;
        }
      }
    }
  }

  const numberMatch = DRIVER_ALIASES.find(alias => alias.number === searchTerm);
  if (numberMatch) {
    return numberMatch.fullName;
  }

  const partialMatch = DRIVER_ALIASES.find(alias =>
    alias.fullName.includes(searchTerm) ||
    alias.aliases.some(term => term.includes(searchTerm))
  );
  if (partialMatch) {
    return partialMatch.fullName;
  }

  return null;
}

/**
 * Extract driver names from user query
 * Example: "gap between KIMI and MAX" → ["ANTONELLI", "VERSTAPPEN"]
 */
export function extractDriverNames(query: string): string[] {
  const words = sanitizeTerm(query).split(/\s+/).filter(Boolean);
  const resolvedNames: string[] = [];

  for (let index = 0; index < words.length; index++) {
    let matched = false;
    const remaining = words.length - index;
    const maxWindow = Math.min(3, remaining);

    for (let span = maxWindow; span >= 1; span--) {
      const candidate = words.slice(index, index + span).join(' ');
      const resolved = resolveDriverName(candidate);
      if (resolved && !resolvedNames.includes(resolved)) {
        resolvedNames.push(resolved);
        index += span - 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      continue;
    }
  }

  return resolvedNames;
}

/**
 * Replace aliases in query with full names
 * Example: "gap to MAX" → "gap to VERSTAPPEN"
 */
export function normalizeDriverQuery(query: string): string {
  let normalized = query;
  NORMALIZE_PATTERNS.forEach(({ regex, replacement }) => {
    normalized = normalized.replace(regex, replacement);
  });
  return normalized;
}
