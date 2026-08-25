import { EntityExplorer } from "./entity-explorer";
import Link from "next/link";

export const metadata = {
  title: "Entity browser — CineSeek",
  description:
    "Browse the canonical people, genres, tags, and movie relationships used by CineSeek.",
};

export default function EntitiesPage() {
  const portfolioMode = process.env.CINESEEK_DEPLOYMENT_MODE === "portfolio";
  return (
    <main className="entitiesPage">
      <header className="topbar entityTopbar">
        <Link className="brand" href="/" aria-label="CineSeek home">
          <span className="brandMark" aria-hidden="true">
            C
          </span>
          <span>CineSeek</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/#discover">Discover</Link>
          <Link href="/entities" aria-current="page">
            Entities
          </Link>
          <Link href="/benchmark">Benchmark</Link>
          <Link href="/#dataset">Dataset</Link>
        </nav>
        <span className="statusBadge">
          <i /> {portfolioMode ? "Public demo" : "Local build"}
        </span>
      </header>
      <section className="entityHero">
        <span className="eyebrow">Canonical knowledge layer</span>
        <h1>
          Browse the entities
          <br />
          <em>behind every match.</em>
        </h1>
        <p>
          Explore normalized people, genres, and tags, then follow their
          relationships back to MovieLens titles.
        </p>
      </section>
      <EntityExplorer />
      <footer>
        <Link className="brand" href="/">
          <span className="brandMark">C</span>
          <span>CineSeek</span>
        </Link>
        <p>Canonical IDs from MovieLens and TMDB enrichment</p>
        <Link href="/">Return to search</Link>
      </footer>
    </main>
  );
}
