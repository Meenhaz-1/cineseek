import type { Metadata } from "next";
import HindiSearch from "./search";
export const metadata: Metadata = {
  title: "Hindi & Hinglish Search — CineSeek",
  description:
    "Explore movie search in Hindi, Hinglish and English, with visible query understanding.",
};
export default function Page() {
  return <HindiSearch />;
}
