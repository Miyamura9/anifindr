// Search Suggestions API
// Returns anime title suggestions + genre suggestions as user types

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { parseSmartQuery } from "@/lib/search/tfidf";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const parsed = parseSmartQuery(q);
    const whereClause: Prisma.AnimeWhereInput = {};

    if (parsed.status) {
      whereClause.status = parsed.status as any;
    }
    if (parsed.year) {
      whereClause.year = parsed.year;
    }
    if (parsed.type) {
      whereClause.type = parsed.type as any;
    }
    
    // Match any of the detected genres
    if (parsed.genreTerms.length > 0) {
      whereClause.genres = {
        some: {
          genre: {
            OR: parsed.genreTerms.map((g) => ({
              name: { contains: g, mode: "insensitive" },
            })),
          },
        },
      };
    }
    
    // If there are leftover title terms, match against titles
    if (parsed.titleTerms.length > 0) {
      const titleQuery = parsed.titleTerms.join(" ");
      whereClause.OR = [
        { title: { contains: titleQuery, mode: "insensitive" } },
        { titleEnglish: { contains: titleQuery, mode: "insensitive" } },
      ];
    }

    // Search anime matching the smart parsed query
    const animes = await prisma.anime.findMany({
      where: whereClause,
      orderBy: [{ popularity: "asc" }], // Most popular first
      take: 6,
      select: {
        id: true,
        title: true,
        titleEnglish: true,
        imageUrl: true,
        score: true,
        type: true,
        year: true,
        genres: { include: { genre: true }, take: 3 },
      },
    });

    // Also match raw genres for genre suggestions (useful if user is just typing a genre)
    const genreSuggestions = await prisma.genre.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      take: 4,
      select: { name: true },
    });

    const suggestions = {
      animes: animes.map((a) => ({
        id: a.id,
        title: a.titleEnglish || a.title,
        titleOriginal: a.title,
        imageUrl: a.imageUrl,
        score: a.score,
        type: a.type,
        year: a.year,
        genres: a.genres.map((g) => g.genre.name),
      })),
      genres: genreSuggestions
        .filter((g) => !animes.some((a) =>
          a.title.toLowerCase().includes(g.name.toLowerCase())
        ))
        .map((g) => g.name),
    };

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("Suggestion error:", error);
    return NextResponse.json({ suggestions: { animes: [], genres: [] } });
  }
}
