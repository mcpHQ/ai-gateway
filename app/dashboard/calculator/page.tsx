import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { modelPrices } from "@/lib/db/schema";
import { requireOrg } from "@/lib/org";
import { MODEL_PRICES } from "@/lib/cost/catalog";
import { Calculator } from "@/components/calculator";

export default async function CalculatorPage() {
  const { org } = await requireOrg();
  const overrides = await db.query.modelPrices.findMany({
    where: eq(modelPrices.organizationId, org.id),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cost calculator</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estimate spend from token counts using the same catalog the proxy uses, including your overrides.
        </p>
      </div>
      <Calculator
        models={MODEL_PRICES}
        overrides={overrides.map((row) => ({
          model: row.model,
          inputPerMillion: Number(row.inputPerMillion),
          outputPerMillion: Number(row.outputPerMillion),
        }))}
      />
    </div>
  );
}
