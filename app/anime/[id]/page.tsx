import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Star, Tv, Calendar, Clock, Users, TrendingUp,
  ExternalLink, ChevronLeft, Play
} from "lucide-react";
import prisma from "@/lib/db/prisma";
import { getSimilarAnime } from "@/lib/search/tfidf";
import AnimeCard from "@/components/AnimeCard";

interface Props {
  params: Promise<{ id: string }>;
}

async function getAnime(id: string) {
  return prisma.anime.findUnique({
    where: { id },
    include: {
      genres: { include: { genre: true } },
      studios: { include: { studio: true } },
      watchLinks: true,
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const anime = await getAnime(id);
  if (!anime) return { title: "Anime Tidak Ditemukan" };
  return {
    title: anime.titleEnglish ?? anime.title,
    description: anime.synopsis?.slice(0, 160) ?? "Detail anime lengkap",
  };
}

function PlatformIcon({ platform }: { platform: string }) {
  const icons: Record<string, string> = {
    CRUNCHYROLL: "🟠",
    BSTATION: "🔵",
    YOUTUBE_MUSE_ASIA: "🔴",
    NETFLIX: "🔴",
    AMAZON_PRIME: "🔵",
    HIDIVE: "🟢",
    OTHER: "⚪",
  };
  return <span>{icons[platform] ?? "▶"}</span>;
}

function PlatformName(platform: string): string {
  const names: Record<string, string> = {
    CRUNCHYROLL: "Crunchyroll",
    BSTATION: "Bstation",
    YOUTUBE_MUSE_ASIA: "Muse Asia",
    NETFLIX: "Netflix",
    AMAZON_PRIME: "Prime Video",
    HIDIVE: "HIDIVE",
    OTHER: "Tonton",
  };
  return names[platform] ?? platform;
}

function ScoreColor(score: number) {
  if (score >= 8) return "#4ade80";
  if (score >= 7) return "#f59e0b";
  if (score >= 6) return "#fb923c";
  return "#f43f5e";
}

export default async function AnimeDetailPage({ params }: Props) {
  const { id } = await params;
  const [anime, similar] = await Promise.all([
    getAnime(id),
    getSimilarAnime(id, 8),
  ]);

  if (!anime) notFound();

  const score = anime.score ?? 0;
  const genres = anime.genres.map((ag) => ag.genre.name);
  const studios = anime.studios.map((as_) => as_.studio.name);

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "1.5rem" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.875rem" }}>Home</Link>
        <span style={{ color: "var(--text-muted)", margin: "0 0.5rem" }}>/</span>
        <Link href="/search" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.875rem" }}>Anime</Link>
        <span style={{ color: "var(--text-muted)", margin: "0 0.5rem" }}>/</span>
        <span style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>{anime.titleEnglish ?? anime.title}</span>
      </div>

      <div className="grid-detail" style={{ display: "grid", gap: "2rem", alignItems: "start" }}>
        {/* LEFT: Poster + Info Sidebar */}
        <div className="sticky-sidebar">
          {/* Poster */}
          <div className="poster-container" style={{
            borderRadius: "var(--radius)", overflow: "hidden",
            background: "var(--bg-elevated)",
            aspectRatio: "2/3", marginBottom: "1rem",
            boxShadow: "var(--shadow-card)",
          }}>
            {anime.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={anime.imageUrl}
                alt={`Poster ${anime.title}`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Tv size={48} style={{ color: "var(--text-muted)" }} />
              </div>
            )}
          </div>

          {/* Quick stats sidebar */}
          <div className="glass" style={{ borderRadius: "var(--radius)", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {score > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Skor</span>
                <span style={{ color: ScoreColor(score), fontWeight: 800, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 4 }}>
                  <Star size={14} fill={ScoreColor(score)} />
                  {score.toFixed(2)}
                </span>
              </div>
            )}
            {anime.rank && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Ranking</span>
                <span style={{ fontWeight: 700, color: "var(--accent-gold)" }}>#{anime.rank}</span>
              </div>
            )}
            {anime.popularity && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Popularitas</span>
                <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>#{anime.popularity}</span>
              </div>
            )}
            {anime.members && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Members</span>
                <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{(anime.members / 1000).toFixed(0)}K</span>
              </div>
            )}
            {anime.episodes && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Episode</span>
                <span style={{ fontWeight: 700 }}>{anime.episodes}</span>
              </div>
            )}
            {anime.type && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Tipe</span>
                <span style={{ fontWeight: 700, color: "var(--accent-primary)" }}>{anime.type}</span>
              </div>
            )}
            {(anime.season || anime.year) && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Season</span>
                <span style={{ fontWeight: 700 }}>{anime.season} {anime.year}</span>
              </div>
            )}
            {anime.rating && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Rating</span>
                <span style={{ fontWeight: 600, fontSize: "0.8rem" }}>{anime.rating.split(" ")[0]}</span>
              </div>
            )}
          </div>

          {/* Watch links */}
          {anime.watchLinks.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h3 style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.5rem" }}>TONTON DI</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {anime.watchLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: "0.6rem",
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", padding: "0.6rem 0.75rem",
                      textDecoration: "none", color: "var(--text-primary)",
                      fontSize: "0.875rem", fontWeight: 600,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <PlatformIcon platform={link.platform} />
                    {link.label ?? PlatformName(link.platform)}
                    <ExternalLink size={12} style={{ marginLeft: "auto", color: "var(--text-muted)" }} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Main content */}
        <div>
          {/* Title */}
          <h1 style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 900,
            fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
            lineHeight: 1.2,
            marginBottom: "0.5rem",
          }}>
            {anime.titleEnglish ?? anime.title}
          </h1>

          {anime.titleJapanese && (
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
              {anime.titleJapanese}
            </p>
          )}

          {/* Meta badges */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {anime.status && (
              <span style={{
                padding: "0.3rem 0.85rem", borderRadius: 50, fontSize: "0.8rem", fontWeight: 700,
                background: anime.status === "AIRING" ? "rgba(74,222,128,0.15)" : "rgba(153,153,187,0.12)",
                color: anime.status === "AIRING" ? "#4ade80" : "var(--text-secondary)",
              }}>
                {anime.status === "AIRING" ? "● Sedang Tayang" : anime.status === "FINISHED" ? "✓ Selesai" : anime.status}
              </span>
            )}
            {anime.source && (
              <span style={{ padding: "0.3rem 0.85rem", borderRadius: 50, fontSize: "0.8rem", background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                Sumber: {anime.source}
              </span>
            )}
            {anime.duration && (
              <span style={{ padding: "0.3rem 0.85rem", borderRadius: 50, fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4, background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                <Clock size={12} /> {anime.duration}
              </span>
            )}
          </div>

          {/* Genres */}
          {genres.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.5rem" }}>GENRE</h3>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {genres.map((g) => (
                  <Link key={g} href={`/search?genre=${g}`} style={{
                    padding: "0.35rem 0.85rem", borderRadius: 50,
                    background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)",
                    color: "var(--accent-primary)", fontSize: "0.8rem", fontWeight: 600,
                    textDecoration: "none",
                  }}>
                    {g}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Studios */}
          {studios.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.5rem" }}>STUDIO</h3>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {studios.map((s) => (
                  <span key={s} style={{
                    padding: "0.35rem 0.85rem", borderRadius: 50,
                    background: "var(--bg-elevated)", border: "1px solid var(--border)",
                    color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 600,
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Synopsis */}
          {anime.synopsis && (
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.75rem" }}>SINOPSIS</h3>
              <div 
                style={{ color: "var(--text-secondary)", lineHeight: 1.8, fontSize: "0.95rem" }}
                dangerouslySetInnerHTML={{ __html: anime.synopsis }}
              />
            </div>
          )}

          {/* Trailer */}
          {anime.trailerUrl && (
            <div style={{ marginBottom: "2rem" }}>
              <h3 style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.75rem" }}>TRAILER</h3>
              <a
                href={anime.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)",
                  color: "var(--accent-hot)", borderRadius: "var(--radius-sm)",
                  padding: "0.6rem 1.25rem", textDecoration: "none", fontWeight: 700, fontSize: "0.9rem",
                }}
              >
                <Play size={16} fill="currentColor" />
                Tonton Trailer
              </a>
            </div>
          )}

          {/* Aired info */}
          {(anime.airedFrom || anime.airedTo) && (
            <div className="glass grid-mobile-1" style={{ borderRadius: "var(--radius)", padding: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
              {anime.airedFrom && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>MULAI TAYANG</div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{new Date(anime.airedFrom).toLocaleDateString("id-ID", { dateStyle: "medium" })}</div>
                </div>
              )}
              {anime.airedTo && (
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>SELESAI</div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{new Date(anime.airedTo).toLocaleDateString("id-ID", { dateStyle: "medium" })}</div>
                </div>
              )}
            </div>
          )}

          {/* Similar Anime */}
          {similar.length > 0 && (
            <div>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 800, fontSize: "1.1rem", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <TrendingUp size={18} style={{ color: "var(--accent-secondary)" }} />
                Anime Serupa
              </h2>
              <div className="grid-responsive-cards">
                {similar.map((anime) => (
                  <AnimeCard
                    key={anime.id}
                    id={anime.id}
                    malId={anime.malId}
                    title={anime.title}
                    titleEnglish={anime.titleEnglish}
                    imageUrl={anime.imageUrl}
                    score={anime.score}
                    episodes={anime.episodes}
                    status={anime.status}
                    year={anime.year}
                    type={anime.type}
                    genres={anime.genres}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
