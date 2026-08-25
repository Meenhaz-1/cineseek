import Link from "next/link";
import { BenchmarkEditor } from "./benchmark-editor";
import { GenreReview } from "./genre-review";

export const metadata = {
  title: "Benchmark editor — CineSeek",
  description:
    "Edit CineSeek evaluation queries and graded relevance judgments.",
};

export default function BenchmarkPage() {
  const readOnly = process.env.CINESEEK_DEPLOYMENT_MODE === "portfolio";
  return (
    <main className="benchmarkPage">
      <header className="topbar entityTopbar">
        <Link className="brand" href="/" aria-label="CineSeek home">
          <span className="brandMark" aria-hidden="true">
            C
          </span>
          <span>CineSeek</span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/#discover">Discover</Link>
          <Link href="/entities">Entities</Link>
          <Link href="/benchmark" aria-current="page">
            Benchmark
          </Link>
          <Link href="/#dataset">Dataset</Link>
        </nav>
        <span className="statusBadge">
          <i /> {readOnly ? "Public demo" : "Local build"}
        </span>
      </header>
      <section className="benchmarkHero">
        <span className="eyebrow">Evaluation workbench</span>
        <h1>
          Shape the tests.
          <br />
          <em>Improve the evidence.</em>
        </h1>
        <p>
          {readOnly
            ? "Explore the provisional queries and relevance evidence used to evaluate CineSeek. Public changes are intentionally disabled."
            : "Edit queries and grade relevant movies without overwriting the generated provisional benchmark."}
        </p>
      </section>
      {readOnly && (
        <p className="portfolioNotice" role="status">
          Public read-only demo: browse the evidence here, then run CineSeek
          locally to create or publish benchmark changes.
        </p>
      )}
      <BenchmarkEditor readOnly={readOnly} />
      <GenreReview readOnly={readOnly} />
      <footer>
        <Link className="brand" href="/">
          <span className="brandMark">C</span>
          <span>CineSeek</span>
        </Link>
        <p>
          {readOnly
            ? "Public benchmark evidence is read-only"
            : "Draft edits remain local until reviewed and promoted"}
        </p>
        <Link href="/">Return to search</Link>
      </footer>
    </main>
  );
}
