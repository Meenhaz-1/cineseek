import Link from "next/link";

export function SiteHeader({ portfolioMode }: { portfolioMode: boolean }) {
  return (
    <header className="topbar">
      <a className="brand" href="#top" aria-label="CineSeek home">
        <span className="brandMark" aria-hidden="true">
          C
        </span>
        <span>CineSeek</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="#discover">Discover</a>
        <Link href="/entities">Entities</Link>
        <Link href="/benchmark">Benchmark</Link>
        <a href="#dataset">Dataset</a>
      </nav>
      <span className="statusBadge">
        <i /> {portfolioMode ? "Public demo" : "Local build"}
      </span>
    </header>
  );
}
