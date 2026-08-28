export function DatasetSection() {
  return (
    <section className="dataset" id="dataset">
      <div>
        <h2>
          From raw ratings to
          <br />
          explainable retrieval.
        </h2>
        <p>
          CineSeek turns MovieLens Latest Small into a searchable corpus with
          transparent metadata, a reproducible evaluation harness, and room for
          optional enrichment.
        </p>
      </div>
      <div className="datasetCard">
        <div className="datasetTop">
          <span className="database">▱</span>
          <div>
            <h3>MovieLens Latest Small</h3>
            <p>Local corpus · transformed &amp; verified</p>
          </div>
          <b>READY</b>
        </div>
        <div className="datasetStats">
          <div>
            <strong>9,742</strong>
            <span>movies indexed</span>
          </div>
          <div>
            <strong>80</strong>
            <span>benchmark queries</span>
          </div>
          <div>
            <strong>Optional</strong>
            <span>TMDB enrichment</span>
          </div>
        </div>
        <ol>
          <li className="done">
            <span>✓</span>
            <div>
              <b>Corpus &amp; metadata</b>
              <small>Titles, genres, tags, ratings, IDs</small>
            </div>
          </li>
          <li className="done">
            <span>✓</span>
            <div>
              <b>Provisional benchmark</b>
              <small>80 relevance queries with reproducible evaluation</small>
            </div>
          </li>
          <li className="done">
            <span>✓</span>
            <div>
              <b>Transparent diagnostics</b>
              <small>Planner, retrieval, scoring, and review evidence</small>
            </div>
          </li>
        </ol>
        <small>
          This product uses TMDB and the TMDB APIs but is not endorsed,
          certified, or otherwise approved by TMDB.
        </small>
      </div>
    </section>
  );
}
