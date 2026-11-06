import { setRequestLocale } from "next-intl/server";
import CalculatorGuide from "@/components/CalculatorGuide";
import MemoryCalculator from "@/components/MemoryCalculator";
import { generateMetadataForTool } from "@/utils/metadata";
import styles from "./page.module.scss";

export async function generateMetadata({ params }) {
  const { locale } = await params;

  return await generateMetadataForTool("memoryCalculator", locale, "/memory-calculator");
}

export default async function MemoryCalculatorPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <MemoryCalculator />
      <div className={styles.guide}>
        <CalculatorGuide tool="memoryCalculator" path="/memory-calculator" />
      </div>
    </>
  );
}
