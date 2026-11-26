import { setRequestLocale } from "next-intl/server";
import CalculatorGuide from "@/components/CalculatorGuide";
import NiaCalculator from "@/components/ProduceRankCalculator/NiaCalculator";
import { generateMetadataForTool } from "@/utils/metadata";
import { TARGET_RATING_BY_RANK } from "@/utils/produceRank";

export async function generateMetadata({ params }) {
  const { locale } = await params;

  return await generateMetadataForTool("niaCalculator", locale, "/calculator/nia", {
    ownImage: true,
  });
}

export default async function NiaProduceRankCalculatorPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <NiaCalculator />
      <CalculatorGuide
        tool="niaCalculator"
        path="/calculator/nia"
        ranks={Object.entries(TARGET_RATING_BY_RANK)}
      />
    </>
  );
}
