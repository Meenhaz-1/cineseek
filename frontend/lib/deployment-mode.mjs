export const PORTFOLIO_MODE = "portfolio";

export function deploymentMode() {
  return process.env.CINESEEK_DEPLOYMENT_MODE?.trim().toLowerCase() || "local";
}

export function isPortfolioMode() {
  return deploymentMode() === PORTFOLIO_MODE;
}

export function portfolioWriteResponse() {
  return Response.json(
    {
      error:
        "This public CineSeek deployment is read-only. Run CineSeek locally to save or publish benchmark changes.",
      code: "PORTFOLIO_READ_ONLY",
    },
    { status: 403 },
  );
}
