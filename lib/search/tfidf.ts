// TF-IDF Search Engine v2
// Smart query parsing + multi-field search with boosted title matching
// Supports: title search, genre keywords, year, status, natural language queries

import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export interface SearchFilter {
  genre?: string | string[];
  year?: number;
  status?: string;
  season?: string;
  minScore?: number;
  type?: string;
}

export interface SearchOptions {
  q: string;
  filters?: SearchFilter;
  page?: number;
  limit?: number;
  sort?: "score" | "rank" | "popularity" | "year" | "title";
  mode?: "tfidf" | "fulltext" | "hybrid";
}

export interface SearchResultItem {
  id: string;
  malId: number;
  title: string;
  titleEnglish: string | null;
  synopsis: string | null;
  score: number | null;
  rank: number | null;
  popularity: number | null;
  imageUrl: string | null;
  status: string;
  year: number | null;
  season: string | null;
  episodes: number | null;
  type: string | null;
  genres: string[];
  studios: string[];
  relevanceScore: number;
  explanation: string[];
}

// ───────────────────────────────────────────
// Smart Query Parser
// ───────────────────────────────────────────

const KNOWN_GENRES = [
  "action", "adventure", "comedy", "drama", "ecchi", "fantasy",
  "horror", "mahou shoujo", "mecha", "music", "mystery", "psychological",
  "romance", "sci-fi", "slice of life", "sports", "supernatural",
  "thriller", "hentai", "isekai",
];

const STOP_WORDS = new Set([
  "rekomendasi", "rekomen", "anime", "yang", "dan", "atau", "untuk",
  "dengan", "di", "ke", "dari", "ini", "itu", "ada", "bisa",
  "tentang", "seperti", "bagus", "terbaik", "top", "populer",
  "popular", "recommend", "recommendation", "best", "good",
  "the", "a", "an", "of", "in", "on", "at", "to", "for",
  "is", "are", "was", "were", "be", "been", "have", "has",
  "with", "about", "like", "show", "series", "film", "movie",
  "cari", "carikan", "kasih", "berikan", "tampilkan", "list",
  "daftar", "saran", "suggest", "find", "search",
]);

const STATUS_KEYWORDS: Record<string, string> = {
  "tayang": "AIRING", "airing": "AIRING", "ongoing": "AIRING",
  "selesai": "FINISHED", "finished": "FINISHED", "completed": "FINISHED", "tamat": "FINISHED",
  "belum": "NOT_YET_AIRED", "upcoming": "NOT_YET_AIRED",
};

const TYPE_KEYWORDS: Record<string, string> = {
  "tv": "TV", "movie": "MOVIE", "film": "MOVIE",
  "ova": "OVA", "ona": "ONA", "special": "SPECIAL",
};

export interface ParsedQuery {
  titleTerms: string[];     // Words likely referring to anime titles
  genreTerms: string[];     // Detected genre names
  year: number | null;      // Detected year
  status: string | null;    // Detected status
  type: string | null;      // Detected type
  allSearchTerms: string[]; // All meaningful terms for text search
}

export function parseSmartQuery(rawQuery: string): ParsedQuery {
  const query = rawQuery.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);

  const genreTerms: string[] = [];
  const titleTerms: string[] = [];
  let year: number | null = null;
  let status: string | null = null;
  let type: string | null = null;
  const allSearchTerms: string[] = [];

  // First pass: detect multi-word genres (e.g., "slice of life", "sci-fi")
  let processedQuery = query;
  for (const genre of KNOWN_GENRES) {
    if (processedQuery.includes(genre)) {
      genreTerms.push(genre);
      processedQuery = processedQuery.replace(genre, " ");
    }
  }

  // Second pass: process remaining words
  const remainingWords = processedQuery.split(/\s+/).filter(Boolean);
  for (const word of remainingWords) {
    // Check year (4-digit number between 1960-2030)
    if (/^\d{4}$/.test(word)) {
      const num = parseInt(word);
      if (num >= 1960 && num <= 2030) {
        year = num;
        continue;
      }
    }

    // Check status keywords
    if (STATUS_KEYWORDS[word]) {
      status = STATUS_KEYWORDS[word];
      continue;
    }

    // Check type keywords
    if (TYPE_KEYWORDS[word]) {
      type = TYPE_KEYWORDS[word];
      continue;
    }

    // Check single-word genres
    if (KNOWN_GENRES.includes(word) && !genreTerms.includes(word)) {
      genreTerms.push(word);
      continue;
    }

    // Skip stop words
    if (STOP_WORDS.has(word)) {
      continue;
    }

    // Everything else is a potential title term
    titleTerms.push(word);
    allSearchTerms.push(word);
  }

  // Add genre terms to search terms too (for searchVector matching)
  allSearchTerms.push(...genreTerms);

  return { titleTerms, genreTerms, year, status, type, allSearchTerms };
}

// ───────────────────────────────────────────
// TF-IDF Relevance Scoring
// ───────────────────────────────────────────

// Field weights for relevance scoring
const FIELD_WEIGHTS = {
  titleExact: 10.0,      // Exact title match
  titleContains: 5.0,    // Title contains the term
  titleEnglish: 4.5,     // English title match
  synopsis: 1.0,         // Synopsis match
  searchVector: 0.5,     // General metadata match
};

function computeRelevanceScore(
  anime: {
    title: string;
    titleEnglish: string | null;
    synopsis: string | null;
    searchVector: string | null;
  },
  titleTerms: string[],
  allTerms: string[]
): number {
  if (allTerms.length === 0 && titleTerms.length === 0) return 0;

  let score = 0;
  const titleLower = anime.title.toLowerCase();
  const titleEngLower = (anime.titleEnglish ?? "").toLowerCase();
  const fullQuery = titleTerms.join(" ");

  // Exact full-query title match (highest boost)
  if (fullQuery && (titleLower.includes(fullQuery) || titleEngLower.includes(fullQuery))) {
    score += FIELD_WEIGHTS.titleExact;
  }

  // Per-term matching with field weights
  for (const term of titleTerms) {
    if (titleLower.includes(term)) {
      score += FIELD_WEIGHTS.titleContains;
      // Extra boost if term appears at the start of the title
      if (titleLower.startsWith(term)) {
        score += 2.0;
      }
    }
    if (titleEngLower.includes(term)) {
      score += FIELD_WEIGHTS.titleEnglish;
      if (titleEngLower.startsWith(term)) {
        score += 2.0;
      }
    }
  }

  // Synopsis and searchVector scoring (TF-IDF-like)
  const synopsisLower = (anime.synopsis ?? "").toLowerCase();
  const vectorLower = (anime.searchVector ?? "").toLowerCase();
  const synopsisWords = synopsisLower.split(/\s+/);
  const vectorWords = vectorLower.split(/\s+/);

  for (const term of allTerms) {
    // Synopsis TF
    const synTf = synopsisWords.filter((w) => w.includes(term)).length;
    if (synTf > 0) {
      score += FIELD_WEIGHTS.synopsis * Math.min(synTf / synopsisWords.length * 10, 1);
    }

    // SearchVector TF
    const vecTf = vectorWords.filter((w) => w.includes(term)).length;
    if (vecTf > 0) {
      score += FIELD_WEIGHTS.searchVector * Math.min(vecTf / vectorWords.length * 10, 1);
    }
  }

  return score;
}

// ───────────────────────────────────────────
// Explanation Builder
// ───────────────────────────────────────────

function buildExplanation(
  anime: {
    title: string;
    titleEnglish: string | null;
    synopsis: string | null;
    searchVector: string | null;
  },
  parsed: ParsedQuery
): string[] {
  const reasons: string[] = [];
  const titleLower = anime.title.toLowerCase();
  const titleEngLower = (anime.titleEnglish ?? "").toLowerCase();

  // Title matches
  const fullQuery = parsed.titleTerms.join(" ");
  if (fullQuery && (titleLower.includes(fullQuery) || titleEngLower.includes(fullQuery))) {
    reasons.push(`Judul cocok: "${fullQuery}"`);
  } else {
    for (const term of parsed.titleTerms) {
      if (titleLower.includes(term)) {
        reasons.push(`Judul mengandung: "${term}"`);
      } else if (titleEngLower.includes(term)) {
        reasons.push(`Judul Inggris mengandung: "${term}"`);
      } else if (anime.synopsis?.toLowerCase().includes(term)) {
        reasons.push(`Sinopsis mengandung: "${term}"`);
      }
    }
  }

  // Genre matches
  if (parsed.genreTerms.length > 0) {
    reasons.push(`Genre: ${parsed.genreTerms.join(", ")}`);
  }

  if (reasons.length === 0) reasons.push("Cocok dari metadata pencarian");
  return reasons;
}

// ───────────────────────────────────────────
// Main Search Function
// ───────────────────────────────────────────

export async function searchAnime(
  options: SearchOptions
): Promise<{ results: SearchResultItem[]; total: number; page: number; totalPages: number }> {
  const { q, filters = {}, page = 1, limit = 20, sort = "score" } = options;
  const offset = (page - 1) * limit;
  const safeLimit = Math.min(limit, 50);

  // Smart parse the query
  const parsed = parseSmartQuery(q);

  // Build WHERE conditions
  const where: Prisma.AnimeWhereInput = {};

  // Text search: search across title, titleEnglish, synopsis, searchVector
  if (parsed.allSearchTerms.length > 0 || parsed.titleTerms.length > 0) {
    const searchTerms = [...new Set([...parsed.titleTerms, ...parsed.allSearchTerms])];

    if (searchTerms.length > 0) {
      // Use OR: match if ANY term appears in ANY field
      where.OR = [
        ...searchTerms.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })),
        ...searchTerms.map((t) => ({ titleEnglish: { contains: t, mode: "insensitive" as const } })),
        ...searchTerms.map((t) => ({ synopsis: { contains: t, mode: "insensitive" as const } })),
        ...searchTerms.map((t) => ({ searchVector: { contains: t, mode: "insensitive" as const } })),
      ];
    }
  }

  // Genre filter: combine parsed genre terms + explicit filter genres
  const allGenres: string[] = [];
  if (parsed.genreTerms.length > 0) {
    // Capitalize for matching DB genre names
    allGenres.push(...parsed.genreTerms.map((g) =>
      g.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    ));
  }
  if (filters.genre && filters.genre.length > 0) {
    const fg = Array.isArray(filters.genre) ? filters.genre : [filters.genre];
    for (const g of fg) {
      if (!allGenres.some((ag) => ag.toLowerCase() === g.toLowerCase())) {
        allGenres.push(g);
      }
    }
  }

  if (allGenres.length > 0) {
    where.genres = {
      some: {
        genre: {
          OR: allGenres.map((g) => ({ name: { equals: g, mode: "insensitive" as const } })),
        },
      },
    };
  }

  // Other filters
  const effectiveYear = parsed.year ?? filters.year;
  const effectiveStatus = parsed.status ?? (filters.status ? filters.status.toUpperCase() : undefined);
  const effectiveType = parsed.type ?? (filters.type || undefined);

  if (effectiveYear) where.year = effectiveYear;
  if (effectiveStatus) where.status = effectiveStatus as never;
  if (filters.season) where.season = filters.season.toUpperCase() as never;
  if (filters.minScore) where.score = { gte: filters.minScore };
  if (effectiveType) where.type = { equals: effectiveType, mode: Prisma.QueryMode.insensitive };

  // Determine sort order
  const orderBy: Prisma.AnimeOrderByWithRelationInput[] = [];
  if (sort === "score") orderBy.push({ score: "desc" });
  else if (sort === "rank") orderBy.push({ rank: "asc" });
  else if (sort === "popularity") orderBy.push({ popularity: "asc" });
  else if (sort === "year") orderBy.push({ year: "desc" });
  else if (sort === "title") orderBy.push({ title: "asc" });
  orderBy.push({ score: "desc" }); // secondary sort

  const [animes, total] = await Promise.all([
    prisma.anime.findMany({
      where,
      orderBy,
      skip: offset,
      take: safeLimit,
      include: {
        genres: { include: { genre: true } },
        studios: { include: { studio: true } },
      },
    }),
    prisma.anime.count({ where }),
  ]);

  const results: SearchResultItem[] = animes.map((anime) => {
    const relevanceScore = computeRelevanceScore(
      anime,
      parsed.titleTerms,
      parsed.allSearchTerms
    );

    return {
      id: anime.id,
      malId: anime.malId,
      title: anime.title,
      titleEnglish: anime.titleEnglish,
      synopsis: anime.synopsis,
      score: anime.score,
      rank: anime.rank,
      popularity: anime.popularity,
      imageUrl: anime.imageUrl,
      status: anime.status,
      year: anime.year,
      season: anime.season,
      episodes: anime.episodes,
      type: anime.type,
      genres: anime.genres.map((ag) => ag.genre.name),
      studios: anime.studios.map((as_) => as_.studio.name),
      relevanceScore,
      explanation: buildExplanation(anime, parsed),
    };
  });

  // Re-sort by relevance score for TF-IDF mode when there's a query
  if (q && (options.mode === "tfidf" || !options.mode)) {
    results.sort((a, b) => b.relevanceScore - a.relevanceScore || (b.score ?? 0) - (a.score ?? 0));
  }

  return {
    results,
    total,
    page,
    totalPages: Math.ceil(total / safeLimit),
  };
}

export async function getAnimeById(id: string) {
  return prisma.anime.findUnique({
    where: { id },
    include: {
      genres: { include: { genre: true } },
      studios: { include: { studio: true } },
      watchLinks: true,
    },
  });
}

export async function getSimilarAnime(animeId: string, limit = 12): Promise<SearchResultItem[]> {
  const source = await prisma.anime.findUnique({
    where: { id: animeId },
    include: { genres: { include: { genre: true } } },
  });

  if (!source) return [];

  const genreNames = source.genres.map((ag) => ag.genre.name);
  const query = [source.title, ...genreNames.slice(0, 3)].join(" ");

  const result = await searchAnime({
    q: query,
    filters: {},
    page: 1,
    limit: limit + 1,
    sort: "score",
  });

  // Filter out the source anime itself
  return result.results.filter((r) => r.id !== animeId).slice(0, limit);
}
