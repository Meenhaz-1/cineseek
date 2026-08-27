export const PORTFOLIO_MODE: "portfolio";
export function deploymentMode(): string;
export function isPortfolioMode(): boolean;
export function benchmarkWritesEnabled(): boolean;
export function benchmarkWriteDisabledResponse(): Response;
export function portfolioWriteResponse(): Response;
