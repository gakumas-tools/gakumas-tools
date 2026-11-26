import { setRequestLocale } from "next-intl/server";
import CalculatorGuide from "@/components/CalculatorGuide";
import HajimeCalculator from "@/components/ProduceRankCalculator/HajimeCalculator";
import { generateMetadataForTool } from "@/utils/metadata";
import { TARGET_RATING_BY_RANK } from "@/utils/produceRank";

export async function generateMetadata({ params }) {
  const { locale } = await params;

  return await generateMetadataForTool(
    "produceRankCalculator",
    locale,
    "/calculator/hajime/produce-rank",
    { ownImage: true },
  );
}

export default async function HajimeProduceRankCalculatorPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <HajimeCalculator />
      <CalculatorGuide
        tool="produceRankCalculator"
        path="/calculator/hajime/produce-rank"
        ranks={Object.entries(TARGET_RATING_BY_RANK)}
      />
    </>
  );
}
