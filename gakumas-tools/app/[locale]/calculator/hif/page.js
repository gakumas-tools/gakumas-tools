import { setRequestLocale } from "next-intl/server";
import CalculatorGuide from "@/components/CalculatorGuide";
import HifCalculator from "@/components/ProduceRankCalculator/HifCalculator";
import { TARGET_RATING_BY_RANK } from "@/utils/hif";
import { generateMetadataForTool } from "@/utils/metadata";

export async function generateMetadata({ params }) {
  const { locale } = await params;

  return await generateMetadataForTool("hifCalculator", locale, "/calculator/hif", {
    ownImage: true,
  });
}

export default async function HifProduceRankCalculatorPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ranks = Object.entries(TARGET_RATING_BY_RANK).slice(0, 11);

  return (
    <>
      <HifCalculator />
      <CalculatorGuide tool="hifCalculator" path="/calculator/hif" ranks={ranks} />
    </>
  );
}
