import type { JsonSchema } from "../types.js";
import type { PortfolioSnapshot, TrickEvaluation } from "../trail/types.js";

export type Trick = {
  id: string;
  paramsSchema: JsonSchema;
  whenItMayFire: string;
  evaluate: (snapshot: PortfolioSnapshot) => TrickEvaluation;
};
